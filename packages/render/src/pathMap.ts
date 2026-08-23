/**
 * BPMN event icon path definitions (BPMN 2.0 / bpmn-js PathMap conventions).
 * Paths are parameterized on a reference box and scaled to each event's bounds.
 */

export interface PathDefinition {
  d: string;
  height: number;
  width: number;
  heightElements: number[];
  widthElements: number[];
}

export interface ScaleParams {
  xScaleFactor: number;
  yScaleFactor: number;
  containerWidth: number;
  containerHeight: number;
  /** Fraction of container width/height for the path M anchor (unless abspos is set). */
  position: { mx: number; my: number };
  /** Optional absolute M anchor — used to offset paths into diagram coordinates. */
  abspos?: { x: number; y: number };
}

const EVENT_PATHS: Record<string, PathDefinition> = {
  EVENT_MESSAGE: {
    d: 'm {mx},{my} l 0,{e.y1} l {e.x1},0 l 0,-{e.y1} z l {e.x0},{e.y0} l {e.x0},-{e.y0}',
    height: 36,
    width: 36,
    heightElements: [6, 14],
    widthElements: [10.5, 21],
  },
  EVENT_SIGNAL: {
    d: 'M {mx},{my} l {e.x0},{e.y0} l -{e.x1},0 Z',
    height: 36,
    width: 36,
    heightElements: [18],
    widthElements: [10, 20],
  },
  EVENT_ESCALATION: {
    d: 'M {mx},{my} l {e.x0},{e.y0} l -{e.x0},-{e.y1} l -{e.x0},{e.y1} Z',
    height: 36,
    width: 36,
    heightElements: [20, 7],
    widthElements: [8],
  },
  EVENT_CONDITIONAL: {
    d: 'M {e.x0},{e.y0} l {e.x1},0 l 0,{e.y2} l -{e.x1},0 Z '
      + 'M {e.x2},{e.y3} l {e.x0},0 '
      + 'M {e.x2},{e.y4} l {e.x0},0 '
      + 'M {e.x2},{e.y5} l {e.x0},0 '
      + 'M {e.x2},{e.y6} l {e.x0},0 '
      + 'M {e.x2},{e.y7} l {e.x0},0 '
      + 'M {e.x2},{e.y8} l {e.x0},0 ',
    height: 36,
    width: 36,
    heightElements: [8.5, 14.5, 18, 11.5, 14.5, 17.5, 20.5, 23.5, 26.5],
    widthElements: [10.5, 14.5, 12.5],
  },
  EVENT_LINK: {
    d: 'm {mx},{my} 0,{e.y0} -{e.x1},0 0,{e.y1} {e.x1},0 0,{e.y0} {e.x0},-{e.y2} -{e.x0},-{e.y2} z',
    height: 36,
    width: 36,
    heightElements: [4.4375, 6.75, 7.8125],
    widthElements: [9.84375, 13.5],
  },
  EVENT_ERROR: {
    d: 'm {mx},{my} {e.x0},-{e.y0} {e.x1},-{e.y1} {e.x2},{e.y2} {e.x3},-{e.y3} -{e.x4},{e.y4} -{e.x5},-{e.y5} z',
    height: 36,
    width: 36,
    heightElements: [0.023, 8.737, 8.151, 16.564, 10.591, 8.714],
    widthElements: [0.085, 6.672, 6.97, 4.273, 5.337, 6.636],
  },
  EVENT_CANCEL_45: {
    d: 'm {mx},{my} -{e.x1},0 0,{e.y0} {e.x1},0 0,{e.y1} {e.x0},0 '
      + '0,-{e.y1} {e.x1},0 0,-{e.y0} -{e.x1},0 0,-{e.y1} -{e.x0},0 z',
    height: 36,
    width: 36,
    heightElements: [4.75, 8.5],
    widthElements: [4.75, 8.5],
  },
  EVENT_COMPENSATION: {
    d: 'm {mx},{my} {e.x0},-{e.y0} 0,{e.y1} z m {e.x1},-{e.y2} {e.x2},-{e.y3} 0,{e.y1} -{e.x2},-{e.y3} z',
    height: 36,
    width: 36,
    heightElements: [6.5, 13, 0.4, 6.1],
    widthElements: [9, 9.3, 8.7],
  },
  EVENT_TIMER_WH: {
    d: 'M {mx},{my} l {e.x0},-{e.y0} m -{e.x0},{e.y0} l {e.x1},{e.y1} ',
    height: 36,
    width: 36,
    heightElements: [10, 2],
    widthElements: [3, 7],
  },
  EVENT_TIMER_LINE: {
    d: 'M {mx},{my} m {e.x0},{e.y0} l -{e.x1},{e.y1} ',
    height: 36,
    width: 36,
    heightElements: [10, 3],
    widthElements: [0, 0],
  },
  EVENT_MULTIPLE: {
    d: 'm {mx},{my} {e.x1},-{e.y0} {e.x1},{e.y0} -{e.x0},{e.y1} -{e.x2},0 z',
    height: 36,
    width: 36,
    heightElements: [6.28099, 12.56199],
    widthElements: [3.1405, 9.42149, 12.56198],
  },
  EVENT_PARALLEL_MULTIPLE: {
    d: 'm {mx},{my} {e.x0},0 0,{e.y1} {e.x1},0 0,{e.y0} -{e.x1},0 0,{e.y1} '
      + '-{e.x0},0 0,-{e.y1} -{e.x1},0 0,-{e.y0} {e.x1},0 z',
    height: 36,
    width: 36,
    heightElements: [2.56228, 7.68683],
    widthElements: [2.56228, 7.68683],
  },
};

const tokenRegex = /\{([^{}]+)\}/g;
const objNotationRegex = /(?:(?:^|\.)(.+?)(?=\[|\.|$|\()|\[('|")(.+?)\2\])(\(\))?/g;

function replacer(all: string, key: string, obj: Record<string, unknown>): string {
  let res: unknown = obj;
  key.replace(objNotationRegex, (_m, name: string, _q: string, quotedName: string) => {
    const prop = name || quotedName;
    if (res && typeof res === 'object' && prop in (res as object)) {
      res = (res as Record<string, unknown>)[prop];
    }
    return '';
  });
  return (res == null || res === obj ? all : String(res));
}

function formatPath(str: string, obj: Record<string, unknown>): string {
  return str.replace(tokenRegex, (all, key) => replacer(all, key, obj));
}

export function getScaledPath(pathId: string, param: ScaleParams): string {
  const rawPath = EVENT_PATHS[pathId];
  if (!rawPath) throw new Error(`Unknown icon path "${pathId}"`);

  const mx = param.abspos ? param.abspos.x : param.containerWidth * param.position.mx;
  const my = param.abspos ? param.abspos.y : param.containerHeight * param.position.my;

  const heightRatio = (param.containerHeight / rawPath.height) * param.yScaleFactor;
  const widthRatio = (param.containerWidth / rawPath.width) * param.xScaleFactor;

  const coordinates: Record<string, number> = {};
  for (let i = 0; i < rawPath.heightElements.length; i++) {
    coordinates[`y${i}`] = rawPath.heightElements[i] * heightRatio;
  }
  for (let i = 0; i < rawPath.widthElements.length; i++) {
    coordinates[`x${i}`] = rawPath.widthElements[i] * widthRatio;
  }

  return formatPath(rawPath.d, { mx, my, e: coordinates });
}

export function scaledPathInBounds(
  pathId: string,
  x: number,
  y: number,
  width: number,
  height: number,
  config: Omit<ScaleParams, 'containerWidth' | 'containerHeight' | 'abspos'>,
): string {
  return getScaledPath(pathId, {
    ...config,
    containerWidth: width,
    containerHeight: height,
    abspos: {
      x: x + width * config.position.mx,
      y: y + height * config.position.my,
    },
  });
}

export function eventPathIds(): string[] {
  return Object.keys(EVENT_PATHS);
}
