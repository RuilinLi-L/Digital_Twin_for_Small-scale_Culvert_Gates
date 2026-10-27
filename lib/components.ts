export type GateComponent = {
  id: string;
  name: string;
  category: string;
  location: string;
  material: string;
  specification: string;
  function: string;
  maintenance: string;
  condition: "正常" | "需关注";
  accent: string;
};

export const gateComponents: GateComponent[] = [
  {
    id: "GATE-01", name: "工作闸门", category: "金属结构", location: "主孔 / 闸室中央",
    material: "钢结构（示意）", specification: "平面钢闸门 · 1 孔（示意）",
    function: "通过升降控制过流断面，是涵闸运行的核心执行构件。",
    maintenance: "检查门叶变形、止水橡皮及轨道磨损，记录启闭过程有无卡阻。",
    condition: "需关注", accent: "#f4ae6a",
  },
  {
    id: "HOIST-01", name: "启闭机", category: "启闭设备", location: "工作桥 / 主孔上方",
    material: "钢制机架（示意）", specification: "卷扬式启闭机构（示意）",
    function: "驱动工作闸门升降，配合限位装置完成启闭操作。",
    maintenance: "检查制动器、钢丝绳、润滑与限位开关，记录异常声响。",
    condition: "正常", accent: "#5dd8c9",
  },
  {
    id: "PIER-L", name: "左侧闸墩", category: "混凝土结构", location: "主孔 / 左岸侧",
    material: "钢筋混凝土（示意）", specification: "矩形闸墩（示意）",
    function: "承托工作桥与闸门轨道，并分隔过流区域。",
    maintenance: "观察表面裂缝、渗水、冲刷及接缝状态。",
    condition: "正常", accent: "#8db9d3",
  },
  {
    id: "PIER-R", name: "右侧闸墩", category: "混凝土结构", location: "主孔 / 右岸侧",
    material: "钢筋混凝土（示意）", specification: "矩形闸墩（示意）",
    function: "承托工作桥与闸门轨道，并维持闸室结构稳定。",
    maintenance: "观察表面裂缝、渗水、冲刷及接缝状态。",
    condition: "正常", accent: "#8db9d3",
  },
  {
    id: "CHAMBER-01", name: "闸室底板", category: "混凝土结构", location: "主孔 / 底部",
    material: "钢筋混凝土（示意）", specification: "整体底板（示意）",
    function: "提供过流通道基础，分散上部结构荷载。",
    maintenance: "检查冲蚀、磨损、沉降及上下游连接段。",
    condition: "正常", accent: "#8db9d3",
  },
  {
    id: "BRIDGE-01", name: "工作桥", category: "通行设施", location: "闸室 / 顶部",
    material: "混凝土与钢护栏（示意）", specification: "单跨工作桥（示意）",
    function: "承载启闭设备并供现场检修人员通行。",
    maintenance: "检查桥面、护栏、支座及通行安全。",
    condition: "正常", accent: "#8db9d3",
  },
];

export const componentIds = new Set(gateComponents.map((item) => item.id));

export type RepairRecord = {
  id: string;
  componentId: string;
  inspectedAt: string;
  inspector: string;
  issue: string;
  action: string;
  status: "正常" | "待处理" | "已处理";
  createdAt: string;
};
