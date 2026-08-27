import { Button, Tag } from "antd";
import { FilterOutlined } from "@ant-design/icons";
import { useDataStore } from "@/stores/dataStore";
import { useFilterStore } from "@/stores/filterStore";

// 全局筛选提示：并入顶部工具栏（Toolbar）内联展示，任一筛选生效时出现，
// 让用户始终知道当前看到的是被筛选后的子集，并可一键清除。无筛选时返回 null。
export default function FilterBar() {
  const filter = useFilterStore();
  const categories = useDataStore((s) => s.categories);

  if (filter.categoryId === null) return null;

  const cat = categories.find((c) => c.id === filter.categoryId);

  return (
    <div className="flex items-center gap-1.5 ml-2 pl-3 border-l border-[var(--sf-border)]">
      <FilterOutlined style={{ color: "var(--sf-text-secondary)", fontSize: 12 }} />
      <span className="text-[12px] text-[var(--sf-text-secondary)] whitespace-nowrap">当前筛选</span>
      {cat && (
        <Tag
          closable
          onClose={() => filter.set({ categoryId: null })}
          style={{ fontSize: 12, marginInlineEnd: 0 }}
        >
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: cat.color }} />
            {cat.name}
          </span>
        </Tag>
      )}
      <Button type="link" size="small" style={{ fontSize: 12, padding: "0 4px" }} onClick={filter.reset}>
        清除
      </Button>
    </div>
  );
}
