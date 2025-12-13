import { createMemo, type Accessor } from "solid-js";
import { getModelColor } from "../utils/colors.js";
import { formatTokens } from "../utils/format.js";

interface ModelListItemProps {
  modelId: string;
  percentage: number;
  inputTokens: number;
  outputTokens: number;
  isSelected: Accessor<boolean>;
}

export function ModelListItem(props: ModelListItemProps) {
  const color = () => getModelColor(props.modelId);
  const isActive = createMemo(() => props.isSelected());
  const bgColor = createMemo(() => isActive() ? "blue" : undefined);

  return (
    <box flexDirection="column">
      <box flexDirection="row" backgroundColor={bgColor()}>
        <text fg={color()} bg={bgColor()}>●</text>
        <text fg={isActive() ? "white" : undefined} bg={bgColor()}>{` ${props.modelId} `}</text>
        <text dim bg={bgColor()}>{`(${props.percentage.toFixed(1)}%)`}</text>
      </box>
      <text dim>{`  In: ${formatTokens(props.inputTokens)} · Out: ${formatTokens(props.outputTokens)}`}</text>
    </box>
  );
}
