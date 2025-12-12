import { getModelColor } from "../utils/colors.js";
import { formatTokens } from "../utils/format.js";

interface ModelListItemProps {
  modelId: string;
  percentage: number;
  inputTokens: number;
  outputTokens: number;
  isSelected: boolean;
}

export function ModelListItem(props: ModelListItemProps) {
  const color = () => getModelColor(props.modelId);
  const bgColor = () => props.isSelected ? "blue" : undefined;

  return (
    <box flexDirection="column">
      <box flexDirection="row" backgroundColor={bgColor()}>
        <text fg={color()}>●</text>
        <text fg={props.isSelected ? "white" : undefined}>{` ${props.modelId} `}</text>
        <text dim>{`(${props.percentage.toFixed(1)}%)`}</text>
      </box>
      <text dim>{`  In: ${formatTokens(props.inputTokens)} · Out: ${formatTokens(props.outputTokens)}`}</text>
    </box>
  );
}
