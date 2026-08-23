import type { LayoutSpacing } from '@bpm/ast';

export interface SpacingProfile {
  nodeNode: number;
  edgeNode: number;
  edgeEdge: number;
  edgeLabel: number;
  nodeNodeBetweenLayers: number;
  edgeNodeBetweenLayers: number;
  edgeEdgeBetweenLayers: number;
  componentComponent: number;
  laneVerticalPadding: number;
  trackSpacing: number;
  /** Minimum gap reserved between adjacent lane content bands. */
  laneChannelBaseGap: number;
  /** Minimum gap between stacked pools before route-demand expansion. */
  poolStackGap: number;
}

const PROFILES: Record<LayoutSpacing, SpacingProfile> = {
  compact: {
    nodeNode: 25, edgeNode: 15, edgeEdge: 10, edgeLabel: 6,
    nodeNodeBetweenLayers: 35, edgeNodeBetweenLayers: 18, edgeEdgeBetweenLayers: 12,
    componentComponent: 35,
    laneVerticalPadding: 12, trackSpacing: 10, laneChannelBaseGap: 8, poolStackGap: 20,
  },
  normal: {
    nodeNode: 40, edgeNode: 25, edgeEdge: 15, edgeLabel: 10,
    nodeNodeBetweenLayers: 60, edgeNodeBetweenLayers: 30, edgeEdgeBetweenLayers: 20,
    componentComponent: 60,
    laneVerticalPadding: 20, trackSpacing: 16, laneChannelBaseGap: 8, poolStackGap: 24,
  },
  relaxed: {
    nodeNode: 55, edgeNode: 35, edgeEdge: 20, edgeLabel: 14,
    nodeNodeBetweenLayers: 80, edgeNodeBetweenLayers: 40, edgeEdgeBetweenLayers: 28,
    componentComponent: 80,
    laneVerticalPadding: 30, trackSpacing: 22, laneChannelBaseGap: 8, poolStackGap: 32,
  },
  spacious: {
    nodeNode: 75, edgeNode: 50, edgeEdge: 30, edgeLabel: 20,
    nodeNodeBetweenLayers: 110, edgeNodeBetweenLayers: 55, edgeEdgeBetweenLayers: 38,
    componentComponent: 110,
    laneVerticalPadding: 40, trackSpacing: 28, laneChannelBaseGap: 10, poolStackGap: 40,
  },
};

export function getSpacingProfile(spacing?: LayoutSpacing): SpacingProfile {
  return PROFILES[spacing ?? 'normal'];
}

export function elkSpacingOptions(profile: SpacingProfile): Record<string, string> {
  return {
    'elk.spacing.nodeNode': String(profile.nodeNode),
    'elk.spacing.edgeNode': String(profile.edgeNode),
    'elk.spacing.edgeEdge': String(profile.edgeEdge),
    'elk.spacing.edgeLabel': String(profile.edgeLabel),
    'elk.layered.spacing.nodeNodeBetweenLayers': String(profile.nodeNodeBetweenLayers),
    'elk.layered.spacing.edgeNodeBetweenLayers': String(profile.edgeNodeBetweenLayers),
    'elk.layered.spacing.edgeEdgeBetweenLayers': String(profile.edgeEdgeBetweenLayers),
    'elk.spacing.componentComponent': String(profile.componentComponent),
  };
}
