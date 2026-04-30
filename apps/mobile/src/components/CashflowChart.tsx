import { Text, View } from "react-native";
import Svg, { G, Line, Rect, Text as SvgText } from "react-native-svg";

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

export function CashflowChart({
  monthlyPreTaxProfit,
  height = 140,
  width,
}: {
  monthlyPreTaxProfit: number[];
  height?: number;
  width: number;
}) {
  if (monthlyPreTaxProfit.length === 0) return null;
  const padX = 24;
  const padTop = 12;
  const padBottom = 24;
  const chartW = width - padX * 2;
  const chartH = height - padTop - padBottom;

  const maxAbs = Math.max(
    1,
    ...monthlyPreTaxProfit.map((v) => Math.abs(v)),
  );
  const zeroY = padTop + chartH / 2;
  const barW = chartW / monthlyPreTaxProfit.length - 4;

  return (
    <View className="bg-surfaceAlt border border-border rounded-2xl p-2">
      <Svg width={width} height={height}>
        <Line
          x1={padX}
          x2={width - padX}
          y1={zeroY}
          y2={zeroY}
          stroke="#2a2a36"
          strokeWidth={1}
        />
        <G>
          {monthlyPreTaxProfit.map((v, i) => {
            const h = (Math.abs(v) / maxAbs) * (chartH / 2);
            const x = padX + i * (chartW / monthlyPreTaxProfit.length) + 2;
            const y = v >= 0 ? zeroY - h : zeroY;
            const fill = v >= 0 ? "#3ddc97" : "#ff5c7a";
            return (
              <Rect
                key={i}
                x={x}
                y={y}
                width={barW}
                height={Math.max(2, h)}
                rx={2}
                fill={fill}
              />
            );
          })}
        </G>
        <G>
          {MONTHS.map((m, i) => {
            const x = padX + i * (chartW / MONTHS.length) + barW / 2 + 2;
            return (
              <SvgText
                key={i}
                x={x}
                y={height - 6}
                fontSize="9"
                fill="#8b8b96"
                textAnchor="middle"
              >
                {m}
              </SvgText>
            );
          })}
        </G>
      </Svg>
      <Text className="text-textMuted text-[10px] text-center mt-1">
        Monthly pre-tax profit
      </Text>
    </View>
  );
}
