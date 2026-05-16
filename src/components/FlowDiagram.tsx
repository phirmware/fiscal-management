import { useMemo } from "react";
import type { FlowGraph, FlowNode } from "../app/insights.js";
import { formatGBP } from "../app/utils/money.js";

interface Props {
  graph: FlowGraph;
}

const WIDTH = 480;
const COL_X = [12, 230, 458];
const NODE_W = 10;
const MIN_NODE_H = 6;
const NODE_GAP = 6;
const PAD_Y = 12;

interface LaidNode extends FlowNode {
  x: number;
  y: number;
  h: number;
  used: number;
}

function layoutColumn(nodes: FlowNode[], colX: number, scale: number): { laid: LaidNode[]; height: number } {
  let cursor = PAD_Y;
  const laid: LaidNode[] = [];
  for (const n of nodes) {
    const h = Math.max(MIN_NODE_H, n.amount * scale);
    laid.push({ ...n, x: colX, y: cursor, h, used: 0 });
    cursor += h + NODE_GAP;
  }
  return { laid, height: cursor };
}

function ribbonPath(
  x1: number,
  y1: number,
  h1: number,
  x2: number,
  y2: number,
  h2: number,
): string {
  const midX = (x1 + x2) / 2;
  // 4-point ribbon: top edge (x1,y1) → (x2,y2), bottom edge (x2,y2+h2) → (x1,y1+h1)
  return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}
          L ${x2} ${y2 + h2} C ${midX} ${y2 + h2}, ${midX} ${y1 + h1}, ${x1} ${y1 + h1} Z`;
}

export function FlowDiagram({ graph }: Props) {
  const { laidByCol, height, missingIncome } = useMemo(() => {
    const total = Math.max(1, graph.totalIncome);
    const col0 = graph.nodes.filter((n) => n.column === 0);
    const col1 = graph.nodes.filter((n) => n.column === 1);
    const col2 = graph.nodes.filter((n) => n.column === 2);

    // Choose a scale that fits the largest column within a reasonable height.
    const maxColAmount = Math.max(
      col1.reduce((s, n) => s + n.amount, 0),
      col2.reduce((s, n) => s + n.amount, 0),
      total,
      1,
    );
    const targetHeight = 420;
    const scale = (targetHeight - PAD_Y * 2 - NODE_GAP * Math.max(col1.length, col2.length, 1)) / maxColAmount;

    const a = layoutColumn(col0, COL_X[0]!, scale);
    const b = layoutColumn(col1, COL_X[1]!, scale);
    const c = layoutColumn(col2, COL_X[2]!, scale);

    const height = Math.max(a.height, b.height, c.height) + PAD_Y;
    return {
      laidByCol: [a.laid, b.laid, c.laid],
      height,
      missingIncome: total === 1 && graph.totalIncome === 0,
    };
  }, [graph]);

  const byId = new Map<string, LaidNode>();
  for (const col of laidByCol) for (const n of col) byId.set(n.id, n);

  if (missingIncome) {
    return <p className="text-sm text-ink-muted">Set this month's income to see the flow.</p>;
  }

  // Render links with stroke-width = link amount * scale. To avoid stacking
  // visual errors, we track the cumulative offset on both ends per node.
  const linkRibbons = graph.links.map((link, i) => {
    const from = byId.get(link.from);
    const to = byId.get(link.to);
    if (!from || !to) return null;
    const fromShare = link.amount / Math.max(1, from.amount);
    const toShare = link.amount / Math.max(1, to.amount);
    const fromY = from.y + from.used;
    const toY = to.y + to.used;
    const fromH = from.h * fromShare;
    const toH = to.h * toShare;
    from.used += fromH;
    to.used += toH;
    return (
      <path
        key={i}
        d={ribbonPath(from.x + NODE_W, fromY, fromH, to.x, toY, toH)}
        fill={to.colour}
        opacity={0.25}
      />
    );
  });

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${height}`}
      className="w-full h-auto"
      role="img"
      aria-label="Income flow diagram"
    >
      {linkRibbons}
      {laidByCol.flat().map((n) => {
        const labelOnRight = n.column !== 2;
        const tx = labelOnRight ? n.x + NODE_W + 4 : n.x - 4;
        const anchor = labelOnRight ? "start" : "end";
        return (
          <g key={n.id}>
            <rect x={n.x} y={n.y} width={NODE_W} height={n.h} fill={n.colour} rx={2} />
            <text x={tx} y={n.y + 10} textAnchor={anchor} className="fill-ink" style={{ fontSize: 11, fontWeight: 600 }}>
              {n.label}
            </text>
            <text x={tx} y={n.y + 22} textAnchor={anchor} className="fill-ink-muted" style={{ fontSize: 10 }}>
              {formatGBP(n.amount)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
