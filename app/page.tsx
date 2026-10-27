"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowDownRight, ArrowRight, Box, Check, ChevronDown, CircleAlert,
  ClipboardList, Clock3, Download, ExternalLink, FileClock, Info, Layers3,
  MapPin, Menu, MousePointer2, Plus, QrCode, Rotate3D, Search, ShieldCheck,
  Waves, X,
} from "lucide-react";
import QRCode from "qrcode";
import SluiceScene from "@/components/sluice-scene";
import { gateComponents, type RepairRecord } from "@/lib/components";

type RecordWithSample = RepairRecord & { sample?: boolean };

const sampleRecords: RecordWithSample[] = [
  {
    id: "DEMO-001", componentId: "GATE-01", inspectedAt: "2026-06-18", inspector: "示例巡检员",
    issue: "门叶止水部位发现轻微磨损，建议复查。", action: "已清理轨道并记录磨损位置，列入下次专项检查。",
    status: "待处理", createdAt: "2026-06-18T09:30:00.000Z", sample: true,
  },
  {
    id: "DEMO-002", componentId: "HOIST-01", inspectedAt: "2026-05-29", inspector: "示例巡检员",
    issue: "启闭机运行平稳，未见异常声响。", action: "完成常规润滑与限位检查。",
    status: "正常", createdAt: "2026-05-29T08:20:00.000Z", sample: true,
  },
];

const today = () => new Date().toLocaleDateString("en-CA");

export default function Home() {
  const [selectedId, setSelectedId] = useState("GATE-01");
  const [records, setRecords] = useState<RepairRecord[]>([]);
  const [recordError, setRecordError] = useState("");
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState("");
  const [filter, setFilter] = useState("");
  const [form, setForm] = useState({
    inspectedAt: today(), inspector: "", issue: "", action: "", status: "正常" as RepairRecord["status"],
  });

  const selected = gateComponents.find((item) => item.id === selectedId) ?? gateComponents[0];
  const visibleComponents = gateComponents.filter((item) =>
    `${item.name} ${item.id} ${item.category}`.toLowerCase().includes(filter.toLowerCase()),
  );
  const selectedRecords = useMemo<RecordWithSample[]>(() => [
    ...records.filter((item) => item.componentId === selectedId),
    ...sampleRecords.filter((item) => item.componentId === selectedId),
  ], [records, selectedId]);

  async function loadRecords() {
    setLoadingRecords(true);
    setRecordError("");
    try {
      const response = await fetch("/api/records", { cache: "no-store" });
      const data = await response.json() as { error?: string; records?: RepairRecord[] };
      if (!response.ok) throw new Error(data.error ?? "加载失败");
      setRecords(data.records ?? []);
    } catch (error) {
      setRecordError(error instanceof Error ? error.message : "记录暂时无法加载");
    } finally { setLoadingRecords(false); }
  }

  useEffect(() => { void loadRecords(); }, []);
  useEffect(() => {
    if (!qrOpen) return;
    const url = window.location.origin + window.location.pathname;
    QRCode.toDataURL(url, { width: 280, margin: 2, color: { dark: "#153849", light: "#ffffff" } })
      .then(setQrDataUrl).catch(() => setQrDataUrl(""));
  }, [qrOpen]);

  async function submitRecord(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitMessage("");
    try {
      const response = await fetch("/api/records", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, componentId: selectedId }),
      });
      const data = await response.json() as { error?: string; record: RepairRecord };
      if (!response.ok) throw new Error(data.error ?? "保存失败");
      setRecords((current) => [data.record, ...current]);
      setForm({ inspectedAt: today(), inspector: form.inspector, issue: "", action: "", status: "正常" });
      setFormOpen(false);
      setSubmitMessage("检修记录已保存，并关联至当前构件。");
      document.getElementById("history")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      setSubmitMessage(error instanceof Error ? error.message : "保存失败，请稍后重试");
    } finally { setSubmitting(false); }
  }

  function navigate(id: string) {
    setMobileNav(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.origin + window.location.pathname);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
      <div className="brand">
        <div className="brand-mark"><Waves size={23} strokeWidth={2.4} /></div>
        <div><strong>涵闸智维</strong><small>H A N Z H A · D I G I T A L</small></div>
        <button className="mobile-close icon-button" onClick={() => setMobileNav(false)} aria-label="关闭菜单"><X size={20} /></button>
      </div>
      <div className="sidebar-label">工作空间</div>
      <nav className="side-nav" aria-label="主导航">
        <button className="active" onClick={() => navigate("overview")}><Layers3 size={18} /> 运维总览 <span className="nav-caret">›</span></button>
        <button onClick={() => navigate("model")}><Box size={18} /> 三维模型</button>
        <button onClick={() => navigate("components")}><ClipboardList size={18} /> 构件档案</button>
        <button onClick={() => navigate("history")}><FileClock size={18} /> 检修记录</button>
      </nav>
      <div className="sidebar-label project-label">当前项目</div>
      <div className="project-switch"><span className="project-icon"><Waves size={18} /></span><span><b>小型涵闸</b><small>数字孪生演示场景</small></span><ChevronDown size={15} /></div>
      <div className="sidebar-bottom">
        <div className="side-help"><span className="help-icon"><Info size={18} /></span><b>项目原型 · 演示版</b><p>几何模型与基础参数均为示意。接入真实 BIM 后可作为实际工程档案使用。</p></div>
        <div className="side-footer"><span className="avatar">华</span><span><b>华中科技大学</b><small>大创项目 · 2026</small></span></div>
      </div>
    </aside>

    {mobileNav && <button className="nav-scrim" onClick={() => setMobileNav(false)} aria-label="关闭导航" />}

    <main className="main-content" id="overview">
      <header className="topbar">
        <button className="mobile-menu icon-button" onClick={() => setMobileNav(true)} aria-label="打开菜单"><Menu size={22} /></button>
        <div className="breadcrumbs">项目空间 <span>/</span> 小型涵闸 <span>/</span> <b>运维总览</b></div>
        <div className="top-actions"><span className="top-live"><i /> 系统运行中</span><button className="top-qr" onClick={() => setQrOpen(true)}><QrCode size={17} /> <span>手机扫码访问</span></button></div>
      </header>

      <div className="content-wrap">
        <div className="intro-row">
          <div><div className="eyebrow"><span /> DIGITAL TWIN · OPERATION SYSTEM <span className="demo-tag">演示原型</span></div>
            <h1>小型涵闸 <em>数字孪生运维</em></h1>
            <p>从三维模型到构件档案，让每一次巡检都有迹可循。</p>
          </div>
          <button className="primary-button intro-cta" onClick={() => { setFormOpen(true); navigate("inspector"); }}><Plus size={18} /> 新建检修记录</button>
        </div>

        <div className="metrics">
          <div className="metric"><span className="metric-icon teal"><Box size={19} /></span><div><small>管理构件</small><strong>06 <span>个</span></strong></div><span className="metric-foot">关键部位</span></div>
          <div className="metric"><span className="metric-icon blue"><ClipboardList size={19} /></span><div><small>已保存记录</small><strong>{String(records.length).padStart(2, "0")} <span>条</span></strong></div><span className="metric-foot">云端数据库存储</span></div>
          <div className="metric"><span className="metric-icon orange"><CircleAlert size={19} /></span><div><small>示意关注点</small><strong>01 <span>处</span></strong></div><span className="metric-foot">闸门止水部位</span></div>
          <div className="metric last"><span className="metric-icon purple"><Activity size={19} /></span><div><small>系统状态</small><strong className="status-word">在线</strong></div><span className="metric-foot">随时可访问</span></div>
        </div>

        <div className="workspace-grid">
          <div className="workspace-main">
            <section className="model-card" id="model">
              <div className="card-heading"><div><div className="section-kicker">INTERACTIVE MODEL</div><h2>涵闸三维模型 <span>01 / 01</span></h2></div><div className="heading-badges"><span className="pill cyan"><i /> 可交互</span><span className="pill">示意模型</span></div></div>
              <div className="model-stage">
                <div className="stage-glow" />
                <SluiceScene selectedId={selectedId} onSelect={setSelectedId} />
                <div className="stage-top"><span className="stage-coordinate"><span className="target-icon">⌖</span> 模型视角 · 轴测图</span><span className="stage-index">COMPONENT ID / {selectedId}</span></div>
                <div className="stage-caption"><span><MousePointer2 size={15} /> 点击模型选择构件</span><span><Rotate3D size={16} /> 拖动旋转 · 滚轮缩放</span></div>
                <div className="stage-scale">01 <span>──</span> 06</div>
              </div>
              <div className="model-footer"><div><span className="footer-pulse" /> 当前选中 <b>{selected.name}</b><small>{selected.id}</small></div><button onClick={() => navigate("components")}>查看全部构件 <ArrowRight size={16} /></button></div>
            </section>

            <section className="component-section" id="components">
              <div className="section-title"><div><div className="section-kicker">ASSET INVENTORY</div><h2>构件档案 <span>共 6 个关键构件</span></h2></div><div className="search-box"><Search size={16} /><input aria-label="搜索构件" placeholder="搜索构件名称或编号" value={filter} onChange={(event) => setFilter(event.target.value)} /></div></div>
              <div className="component-grid">
                {visibleComponents.map((item, index) => <button key={item.id} className={`component-card ${selectedId === item.id ? "selected" : ""}`} onClick={() => { setSelectedId(item.id); navigate("model"); }}>
                  <div className="component-card-top"><span className="component-num">0{index + 1}</span><span className={`condition ${item.condition === "需关注" ? "attention" : ""}`}><i /> {item.condition}</span></div>
                  <div className="component-symbol" style={{ color: item.accent }}><Box size={31} strokeWidth={1.4} /></div>
                  <strong>{item.name}</strong><span className="component-id">{item.id}</span>
                  <div className="component-card-bottom"><span>{item.category}</span><ArrowDownRight size={17} /></div>
                </button>)}
                {visibleComponents.length === 0 && <div className="empty-search">未找到匹配的构件。</div>}
              </div>
            </section>

            <section className="history-section" id="history">
              <div className="section-title history-heading"><div><div className="section-kicker">MAINTENANCE LOG</div><h2>检修记录 <span>当前构件 · {selected.name}</span></h2></div><button className="text-button" onClick={() => { setFormOpen(true); navigate("inspector"); }}><Plus size={16} /> 新增记录</button></div>
              {submitMessage && !formOpen && <div className="success-note"><Check size={16} /> {submitMessage}</div>}
              {recordError && <div className="error-note"><CircleAlert size={16} /> {recordError} <button onClick={() => void loadRecords()}>重试</button></div>}
              <div className="record-list">
                {loadingRecords ? <div className="record-empty">正在读取检修记录…</div> : selectedRecords.length ? selectedRecords.map((record) => <article className="record-item" key={record.id}>
                  <div className="record-timeline"><span className={`timeline-dot ${record.status === "待处理" ? "orange" : ""}`} /><span /></div>
                  <div className="record-body"><div className="record-head"><strong>{record.issue}</strong><span className={`record-status ${record.status === "待处理" ? "pending" : ""}`}>{record.status}</span></div>
                    <p>{record.action}</p><div className="record-meta"><span><Clock3 size={14} /> {record.inspectedAt}</span><span>巡检人：{record.inspector}</span>{record.sample && <span className="sample-badge">演示样例</span>}</div>
                  </div>
                </article>) : <div className="record-empty">这个构件还没有检修记录。点击“新增记录”开始建立档案。</div>}
              </div>
            </section>
          </div>

          <aside className="inspector" id="inspector">
            <div className="inspector-top"><div><span className="inspector-kicker">COMPONENT DETAILS</span><h2>构件信息</h2></div><span className="inspector-symbol"><Layers3 size={21} /></span></div>
            <div className="inspector-hero"><div className="blueprint-lines" /><span className="hero-id">{selected.id}</span><div className="hero-glyph"><Box size={54} strokeWidth={1.1} /></div><div className="hero-label"><small>当前选中构件</small><strong>{selected.name}</strong></div></div>
            <div className="inspector-status"><span><i /> {selected.condition === "需关注" ? "建议关注" : "状态正常"}</span><small>静态示意状态</small></div>
            <div className="detail-group"><div className="detail-heading">基础档案 <span>01</span></div>
              <dl><div><dt>构件编号</dt><dd className="mono">{selected.id}</dd></div><div><dt>构件类型</dt><dd>{selected.category}</dd></div><div><dt>安装位置</dt><dd>{selected.location}</dd></div><div><dt>材料</dt><dd>{selected.material}</dd></div><div><dt>规格</dt><dd>{selected.specification}</dd></div></dl>
            </div>
            <div className="detail-group description"><div className="detail-heading">功能与巡检 <span>02</span></div><p>{selected.function}</p><div className="maintenance-tip"><ShieldCheck size={17} /><span>{selected.maintenance}</span></div></div>
            <button className="inspector-button" onClick={() => setFormOpen(true)}><Plus size={17} /> 录入该构件检修记录 <ArrowRight size={17} /></button>
            <div className="inspector-note"><Info size={15} /> 参数与几何为演示数据，请勿用于工程判断。</div>
          </aside>
        </div>

        <footer className="page-footer"><span>© 2026 涵闸智维 · 华中科技大学大学生创新训练项目</span><span>小型涵闸轻量化数字孪生运维技术与系统构建</span></footer>
      </div>
    </main>

    {formOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setFormOpen(false); }}><div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="form-title">
      <div className="modal-header"><div><span className="section-kicker">NEW MAINTENANCE LOG</span><h2 id="form-title">新增检修记录</h2><p>记录将自动关联至 {selected.name}（{selected.id}）</p></div><button className="icon-button" onClick={() => setFormOpen(false)} aria-label="关闭表单"><X size={21} /></button></div>
      <form onSubmit={submitRecord} className="record-form"><div className="form-row"><label>关联构件<input value={`${selected.name} · ${selected.id}`} disabled /></label><label>检查日期<input type="date" required value={form.inspectedAt} max={today()} onChange={(event) => setForm({ ...form, inspectedAt: event.target.value })} /></label></div>
        <div className="form-row"><label>巡检人员<input required maxLength={40} placeholder="例如：演示巡检员" value={form.inspector} onChange={(event) => setForm({ ...form, inspector: event.target.value })} /></label><label>处理状态<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as RepairRecord["status"] })}><option>正常</option><option>待处理</option><option>已处理</option></select></label></div>
        <label>检查情况 / 问题描述<textarea required minLength={2} maxLength={600} rows={3} placeholder="例如：闸门止水部位轻微磨损…" value={form.issue} onChange={(event) => setForm({ ...form, issue: event.target.value })} /></label>
        <label>处理措施 / 建议<textarea required minLength={2} maxLength={600} rows={3} placeholder="例如：完成清理，并列入下次专项检查…" value={form.action} onChange={(event) => setForm({ ...form, action: event.target.value })} /></label>
        {submitMessage && <div className="form-error"><CircleAlert size={16} /> {submitMessage}</div>}
        <div className="form-actions"><span><Info size={15} /> 公开演示记录对所有访客可见，请勿填写敏感信息</span><div><button type="button" className="secondary-button" onClick={() => setFormOpen(false)}>取消</button><button type="submit" className="primary-button" disabled={submitting}>{submitting ? "正在保存…" : "提交记录"}<ArrowRight size={17} /></button></div></div>
      </form>
    </div></div>}

    {qrOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setQrOpen(false); }}><div className="qr-modal" role="dialog" aria-modal="true" aria-labelledby="qr-title"><button className="qr-close icon-button" onClick={() => setQrOpen(false)} aria-label="关闭二维码"><X size={20} /></button><span className="qr-modal-icon"><QrCode size={25} /></span><h2 id="qr-title">手机扫码访问</h2><p>在手机上查看模型、查询构件并录入检修记录。</p><div className="qr-image">{qrDataUrl ? <img src={qrDataUrl} alt="本站访问二维码" /> : <QrCode size={80} />}</div><small>网站已公开，评委扫码后无需登录即可浏览。</small><div className="qr-actions"><button onClick={() => void copyLink()}>{copied ? <Check size={17} /> : <ExternalLink size={17} />}{copied ? "已复制链接" : "复制访问链接"}</button>{qrDataUrl && <a href={qrDataUrl} download="涵闸智维-访问二维码.png"><Download size={17} /> 下载二维码</a>}</div></div></div>}
  </div>;
}
