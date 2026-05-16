import { useMemo } from "react";
import type { FlowGraph, FlowNode } from "../app/insights.js";
import { formatGBP } from "../app/utils/money.js";

interface Props {
  graph: FlowGraph;
}

const WIDTH = 480;
const COL_X = [10, 220, 466];
const NODE_W = 8;
const MIN_NODE_H = 4;
const NODE_GAP = 8;
const PAD_Y = 14;

interface LaidNode extends FlowNode {
  x: number;
  y: number;
  h: number;
  usedLeft: number;
  usedRight: number;
}

function layoutColumn(nodes: FlowNode[], colX: number, scale: number): { laid: LaidNode[]; height: number } {
  let cursor = PAD_Y;
  const laid: LaidNode[] = [];
  for (const n of nodes) {
    const h = Math.max(MIN_NODE_H, n.amount * scale);
    laid.push({ ...n, x: colX, y: cursor, h, usedLeft: 0, usedRight: 0 });
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
  return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2} L ${x2} ${y2 + h2} C ${midX} ${y2 + h2}, ${midX} ${y1 + h1}, ${x1} ${y1 + h1} Z`;
}

function truncate(label: string, max = 16): string {
  return label.length > max ? label.slice(0, max - 1) + "…" : label;
}

export function FlowDiagram({ graph }: Props) {
  const layout = useMemo(() => {
    const total = Math.max(1, graph.totalIncome);
    const col0 = graph.nodes.filter((n) => n.column === 0);
    const col1 = graph.nodes.filter((n) => n.column === 1);
    const col2 = graph.nodes.filter((n) => n.column === 2);

    const col1Sum = col1.reduce((s, n) => s + n.amount, 0);
    const col2Sum = col2.reduce((s, n) => s + n.amount, 0);
    const maxColAmount = Math.max(total, col1Sum, col2Sum, 1);
    const maxNodeCount = Math.max(col0.length, col1.length, col2.length, 1);
    const targetHeight = 440;
    const scale = (targetHeight - PAD_Y * 2 - NODE_GAP * (maxNodeCount - 1)) / maxColAmount;

    const a = layoutColumn(col0, COL_X[0]!, scale);
    const b = layoutColumn(col1, COL_X[1]!, scale);
    const c = layoutColumn(col2, COL_X[2]!, scale);

    const height = Math.max(a.height, b.height, c.height) + PAD_Y;
    return { laidByCol: [a.laid, b.laid, c.laid], height, scale };
  }, [graph]);

  if (graph.totalIncome <= 0) {
    return <p className="text-sm text-ink-muted">Set this month's income to see the flow.</p>;
  }

  const { laidByCol, height, scale } = layout;
  const byId = new Map<string, LaidNode>();
  for (const col of laidByCol) for (const n of col) byId.set(n.id, n);

  // Ribbons attach to source's right edge and dest's left edge.
  // Each side stacks independently so a group's incoming and outgoing ribbons
  // both begin at the top of the node and grow downward as more ribbons attach.
  const linkRibbons = graph.links.map((link, i) => {
    const from = byId.get(link.from);
    const to = byId.get(link.to);
    if (!from || !to) return null;
    const ribbonH = link.amount * scale;
    const fromY = from.y + from.usedRight;
    const toY = to.y + to.usedLeft;
    from.usedRight += ribbonH;
    to.usedLeft += ribbonH;
    return (
      <path
        key={`l${i}`}
        d={ribbonPath(from.x + NODE_W, fromY, ribbonH, to.x, toY, ribbonH)}
        style={{ fill: to.colour }}
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
        const tx = labelOnRight ? n.x + NODE_W + 5 : n.x - 5;
        const anchor = labelOnRight ? "start" : "end";
        return (
          <g key={n.id}>
            <rect
              x={n.x}
              y={n.y}
              width={NODE_W}
              height={n.h}
              rx={2}
              style={{ fill: n.colour }}
            />
            <text
              x={tx}
              y={n.y + 10}
              textAnchor={anchor}
              className="fill-ink"
              style={{ fontSize: 11, fontWeight: 600 }}
            >
              {truncate(n.label)}
            </text>
            <text
              x={tx}
              y={n.y + 22}
              textAnchor={anchor}
              className="fill-ink-muted"
              style={{ fontSize: 10 }}
            >
              {formatGBP(n.amount)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
