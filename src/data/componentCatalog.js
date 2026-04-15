export const componentCatalog = [
  { id: '1', componentName: '闸门', material: '混凝土' },
  { id: '2', componentName: '闸门', material: '混凝土' },
  { id: '3', componentName: '上游右翼墙', material: '混凝土' },
  { id: '4', componentName: '上游左翼墙', material: '混凝土' },
  { id: '5', componentName: '下游左翼墙', material: '混凝土' },
  { id: '6', componentName: '下游右翼墙', material: '混凝土' }
]

export const componentCatalogById = Object.fromEntries(
  componentCatalog.map((item) => [item.id, item])
)
