import { For, createMemo } from "solid-js";
import type { TUIData, SortType } from "../hooks/useData.js";
import { getModelColor } from "../utils/colors.js";
import { formatTokensCompact, formatCostFull } from "../utils/format.js";

interface ModelViewProps {
  data: TUIData;
  sortBy: SortType;
  sortDesc: boolean;
  selectedIndex: number;
  height: number;
}

export function ModelView(props: ModelViewProps) {
  const sortedEntries = createMemo(() => {
    const entries = props.data.modelEntries;
    const sortBy = props.sortBy;
    const sortDesc = props.sortDesc;
    
    return [...entries].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "cost") cmp = a.cost - b.cost;
      else if (sortBy === "tokens") cmp = a.total - b.total;
      else cmp = a.model.localeCompare(b.model);
      return sortDesc ? -cmp : cmp;
    });
  });

  const visibleEntries = createMemo(() => sortedEntries().slice(0, props.height - 3));

  return (
    <box flexDirection="column">
      <box flexDirection="row">
        <text fg="cyan" bold>
          {"  Source/Model".padEnd(24)}
          {"Input".padStart(12)}
          {"Output".padStart(12)}
          {"Cache".padStart(12)}
          {"Total".padStart(14)}
          {"Cost".padStart(12)}
        </text>
      </box>
      <box borderStyle="single" borderTop={false} borderLeft={false} borderRight={false} borderBottom borderColor="gray" />

      <For each={visibleEntries()}>
        {(entry, i) => {
          const isSelected = () => i() === props.selectedIndex;
          const sourceLabel = entry.source.charAt(0).toUpperCase() + entry.source.slice(1);
          const displayName = `${sourceLabel} ${entry.model}`.slice(0, 22);

          return (
            <box flexDirection="row">
              <text fg={getModelColor(entry.model)} backgroundColor={isSelected() ? "blue" : undefined}>●</text>
              <text
                backgroundColor={isSelected() ? "blue" : undefined}
                fg={isSelected() ? "white" : undefined}
              >
                {displayName.padEnd(23)}
                {formatTokensCompact(entry.input).padStart(12)}
                {formatTokensCompact(entry.output).padStart(12)}
                {formatTokensCompact(entry.cacheRead).padStart(12)}
                {formatTokensCompact(entry.total).padStart(14)}
              </text>
              <text
                fg="green"
                backgroundColor={isSelected() ? "blue" : undefined}
              >
                {formatCostFull(entry.cost).padStart(12)}
              </text>
            </box>
          );
        }}
      </For>
    </box>
  );
}
