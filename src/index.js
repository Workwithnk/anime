// Defaults

const defaultInstanceSettings = {
  update: null,
  begin: null,
  loopBegin: null,
  changeBegin: null,
  change: null,
  changeComplete: null,
  loopComplete: null,
  complete: null,
  loop: 1,
  direction: 'normal',
  autoplay: true,
  startTime: 0,
  timelineOffset: 0
}

const defaultTweenSettings = {
  duration: 1000,
  delay: 0,
  endDelay: 0,
  easing: 'easeOutElastic(1, .5)',
  round: 0
}

const validTransforms = ['translateX', 'translateY', 'translateZ', 'rotate', 'rotateX', 'rotateY', 'rotateZ', 'scale', 'scaleX', 'scaleY', 'scaleZ', 'skew', 'skewX', 'skewY', 'perspective'];

// Caching

const cache = {
  CSS: {},
  springs: {}
}

// Utils

function minMax(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

function stringContains(str, text) {
  return str.indexOf(text) > -1;
}

function applyArguments(func, args) {
  return func.apply(null, args);
}

const is = {
  arr: a => Array.isArray(a),
  obj: a => stringContains(Object.prototype.toString.call(a), 'Object'),
  pth: a => is.obj(a) && a.hasOwnProperty('totalLength'),
  svg: a => a instanceof SVGElement,
  inp: a => a instanceof HTMLInputElement,
  dom: a => a.nodeType || is.svg(a),
  str: a => typeof a === 'string',
  fnc: a => typeof a === 'function',
  und: a => typeof a === 'undefined',
  hex: a => /(^#[0-9A-F]{6}$)|(^#[0-9A-F]{3}$)/i.test(a),
  rgb: a => /^rgb/.test(a),
  hsl: a => /^hsl/.test(a),
  col: a => (is.hex(a) || is.rgb(a) || is.hsl(a)),
  key: a => !defaultInstanceSettings.hasOwnProperty(a) && !defaultTweenSettings.hasOwnProperty(a) && a !== 'targets' && a !== 'keyframes' && a !== 'states'
}

// Easings

function parseEasingParameters(string) {
  const match = /\(([^)]+)\)/.exec(string);
  return match ? match[1].split(',').map(p => parseFloat(p)) : [];
}

// Spring solver inspired by Webkit Copyright © 2016 Apple Inc. All rights reserved. https://webkit.org/demos/spring/spring.js

function spring(string, duration) {

  const params = parseEasingParameters(string);
  const mass = minMax(is.und(params[0]) ? 1 : params[0], .1, 100);
  const stiffness = minMax(is.und(params[1]) ? 100 : params[1], .1, 100);
  const damping = minMax(is.und(params[2]) ? 10 : params[2], .1, 100);
  const velocity =  minMax(is.und(params[3]) ? 0 : params[3], .1, 100);
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const wd = zeta < 1 ? w0 * Math.sqrt(1 - zeta * zeta) : 0;
  const a = 1;
  const b = zeta < 1 ? (zeta * w0 + -velocity) / wd : -velocity + w0;

  function solver(t) {
    let progress = duration ? (duration * t) / 1000 : t;
    if (zeta < 1) {
      progress = Math.exp(-progress * zeta * w0) * (a * Math.cos(wd * progress) + b * Math.sin(wd * progress));
    } else {
      progress = (a + b * progress) * Math.exp(-progress * w0);
    }
    if (t === 0 || t === 1) return t;
    return 1 - progress;
  }

  function getDuration() {
    const cached = cache.springs[string];
    if (cached) return cached;
    const frame = 1/6;
    let elapsed = 0;
    let rest = 0;
    while(true) {
      elapsed += frame;
      if (solver(elapsed) === 1) {
        rest++;
        if (rest >= 16) break;
      } else {
        rest = 0;
      }
    }
    const duration = elapsed * frame * 1000;
    cache.springs[string] = duration;
    return duration;
  }

  return duration ? solver : getDuration;

}

// Elastic easing adapted from jQueryUI http://api.jqueryui.com/easings/

function elastic(amplitude = 1, period = .5) {
  const a = minMax(amplitude, 1, 10);
  const p = minMax(period, .1, 2);
  return t => {
    return (t === 0 || t === 1) ? t : 
      -a * Math.pow(2, 10 * (t - 1)) * Math.sin((((t - 1) - (p / (Math.PI * 2) * Math.asin(1 / a))) * (Math.PI * 2)) / p);
  }
}

// Basic steps easing implementation https://developer.mozilla.org/fr/docs/Web/CSS/transition-timing-function

function steps(steps = 10) {
  return t => Math.round(t * steps) * (1 / steps);
}

// BezierEasing https://github.com/gre/bezier-easing

const bezier = (() => {

  const kSplineTableSize = 11;
  const kSampleStepSize = 1.0 / (kSplineTableSize - 1.0);

  function A(aA1, aA2) { return 1.0 - 3.0 * aA2 + 3.0 * aA1 };
  function B(aA1, aA2) { return 3.0 * aA2 - 6.0 * aA1 };
  function C(aA1)      { return 3.0 * aA1 };

  function calcBezier(aT, aA1, aA2) { return ((A(aA1, aA2) * aT + B(aA1, aA2)) * aT + C(aA1)) * aT };
  function getSlope(aT, aA1, aA2) { return 3.0 * A(aA1, aA2) * aT * aT + 2.0 * B(aA1, aA2) * aT + C(aA1) };

  function binarySubdivide(aX, aA, aB, mX1, mX2) {
    let currentX, currentT, i = 0;
    do {
      currentT = aA + (aB - aA) / 2.0;
      currentX = calcBezier(currentT, mX1, mX2) - aX;
      if (currentX > 0.0) { aB = currentT } else { aA = currentT };
    } while (Math.abs(currentX) > 0.0000001 && ++i < 10);
    return currentT;
  }

  function newtonRaphsonIterate(aX, aGuessT, mX1, mX2) {
    for (let i = 0; i < 4; ++i) {
      const currentSlope = getSlope(aGuessT, mX1, mX2);
      if (currentSlope === 0.0) return aGuessT;
      const currentX = calcBezier(aGuessT, mX1, mX2) - aX;
      aGuessT -= currentX / currentSlope;
    }
    return aGuessT;
  }

  function bezier(mX1, mY1, mX2, mY2) {

    if (!(0 <= mX1 && mX1 <= 1 && 0 <= mX2 && mX2 <= 1)) return;
    let sampleValues = new Float32Array(kSplineTableSize);

    if (mX1 !== mY1 || mX2 !== mY2) {
      for (let i = 0; i < kSplineTableSize; ++i) {
        sampleValues[i] = calcBezier(i * kSampleStepSize, mX1, mX2);
      }
    }

    function getTForX(aX) {

      let intervalStart = 0.0;
      let currentSample = 1;
      const lastSample = kSplineTableSize - 1;

      for (; currentSample !== lastSample && sampleValues[currentSample] <= aX; ++currentSample) {
        intervalStart += kSampleStepSize;
      }

      --currentSample;

      const dist = (aX - sampleValues[currentSample]) / (sampleValues[currentSample + 1] - sampleValues[currentSample]);
      const guessForT = intervalStart + dist * kSampleStepSize;
      const initialSlope = getSlope(guessForT, mX1, mX2);

      if (initialSlope >= 0.001) {
        return newtonRaphsonIterate(aX, guessForT, mX1, mX2);
      } else if (initialSlope === 0.0) {
        return guessForT;
      } else {
        return binarySubdivide(aX, intervalStart, intervalStart + kSampleStepSize, mX1, mX2);
      }

    }

    return x => {
      if (mX1 === mY1 && mX2 === mY2) return x;
      if (x === 0 || x === 1) return x;
      return calcBezier(getTForX(x), mY1, mY2);
    }

  }

  return bezier;

})();

const penner = (() => {

  const names = ['Quad', 'Cubic', 'Quart', 'Quint', 'Sine', 'Expo', 'Circ', 'Back', 'Elastic'];

  // Approximated Penner equations http://matthewlein.com/ceaser/

  const curves = {
    In: [
      [0.550, 0.085, 0.680, 0.530], /* inQuad */
      [0.550, 0.055, 0.675, 0.190], /* inCubic */
      [0.895, 0.030, 0.685, 0.220], /* inQuart */
      [0.755, 0.050, 0.855, 0.060], /* inQuint */
      [0.470, 0.000, 0.745, 0.715], /* inSine */
      [0.950, 0.050, 0.795, 0.035], /* inExpo */
      [0.600, 0.040, 0.980, 0.335], /* inCirc */
      [0.600,-0.280, 0.735, 0.045], /* inBack */
      elastic /* inElastic */
    ],
    Out: [
      [0.250, 0.460, 0.450, 0.940], /* outQuad */
      [0.215, 0.610, 0.355, 1.000], /* outCubic */
      [0.165, 0.840, 0.440, 1.000], /* outQuart */
      [0.230, 1.000, 0.320, 1.000], /* outQuint */
      [0.390, 0.575, 0.565, 1.000], /* outSine */
      [0.190, 1.000, 0.220, 1.000], /* outExpo */
      [0.075, 0.820, 0.165, 1.000], /* outCirc */
      [0.175, 0.885, 0.320, 1.275], /* outBack */
      (a, p) => t => 1 - elastic(a, p)(1 - t) /* outElastic */
    ],
    InOut: [
      [0.455, 0.030, 0.515, 0.955], /* inOutQuad */
      [0.645, 0.045, 0.355, 1.000], /* inOutCubic */
      [0.770, 0.000, 0.175, 1.000], /* inOutQuart */
      [0.860, 0.000, 0.070, 1.000], /* inOutQuint */
      [0.445, 0.050, 0.550, 0.950], /* inOutSine */
      [1.000, 0.000, 0.000, 1.000], /* inOutExpo */
      [0.785, 0.135, 0.150, 0.860], /* inOutCirc */
      [0.680,-0.550, 0.265, 1.550], /* inOutBack */
      (a, p) => t => t < .5 ? elastic(a, p)(t * 2) / 2 : 1 - elastic(a, p)(t * -2 + 2) / 2 /* inOutElastic */
    ]
  }

  let eases = { 
    linear: [0.250, 0.250, 0.750, 0.750]
  }

  for (let coords in curves) {
    curves[coords].forEach((ease, i) => {
      eases['ease'+coords+names[i]] = ease;
    });
  }

  return eases;

})();

function parseEasings(easing, duration) {
  if (is.fnc(easing)) return easing;
  const name = easing.split('(')[0];
  const ease = penner[name];
  const args = parseEasingParameters(easing);
  switch (name) {
    case 'spring' : return spring(easing, duration);
    case 'cubicBezier' : return applyArguments(bezier, args);
    case 'steps' : return applyArguments(steps, args);
    default : return is.fnc(ease) ? applyArguments(ease, args) : applyArguments(bezier, ease);
  }
}

// Strings

function selectString(str) {
  try {
    let nodes = document.querySelectorAll(str);
    return nodes;
  } catch(e) {
    return;
  }
}

// Arrays

function filterArray(arr, callback) {
  const len = arr.length;
  const thisArg = arguments.length >= 2 ? arguments[1] : void 0;
  const result = [];
  for (let i = 0; i < len; i++) {
    if (i in arr) {
      const val = arr[i];
      if (callback.call(thisArg, val, i, arr)) {
        result.push(val);
      }
    }
  }
  return result;
}

function flattenArray(arr) {
  return arr.reduce((a, b) => a.concat(is.arr(b) ? flattenArray(b) : b), []);
}

function toArray(o) {
  if (is.arr(o)) return o;
  if (is.str(o)) o = selectString(o) || o;
  if (o instanceof NodeList || o instanceof HTMLCollection) return [].slice.call(o);
  return [o];
}

function arrayContains(arr, val) {
  return arr.some(a => a === val);
}

// Objects

function cloneObject(o) {
  const clone = {};
  for (let p in o) clone[p] = o[p];
  return clone;
}

function replaceObjectProps(o1, o2) {
  const o = cloneObject(o1);
  for (let p in o1) o[p] = o2.hasOwnProperty(p) ? o2[p] : o1[p];
  return o;
}

function mergeObjects(o1, o2) {
  const o = cloneObject(o1);
  for (let p in o2) o[p] = is.und(o1[p]) ? o2[p] : o1[p];
  return o;
}

// Colors

function rgbToRgba(rgbValue) {
  const rgb = /rgb\((\d+,\s*[\d]+,\s*[\d]+)\)/g.exec(rgbValue);
  return rgb ? `rgba(${rgb[1]},1)` : rgbValue;
}

function hexToRgba(hexValue) {
  const rgx = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  const hex = hexValue.replace(rgx, (m, r, g, b) => r + r + g + g + b + b );
  const rgb = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  const r = parseInt(rgb[1], 16);
  const g = parseInt(rgb[2], 16);
  const b = parseInt(rgb[3], 16);
  return `rgba(${r},${g},${b},1)`;
}

function hslToRgba(hslValue) {
  const hsl = /hsl\((\d+),\s*([\d.]+)%,\s*([\d.]+)%\)/g.exec(hslValue) || /hsla\((\d+),\s*([\d.]+)%,\s*([\d.]+)%,\s*([\d.]+)\)/g.exec(hslValue);
  const h = parseInt(hsl[1], 10) / 360;
  const s = parseInt(hsl[2], 10) / 100;
  const l = parseInt(hsl[3], 10) / 100;
  const a = hsl[4] || 1;
  function hue2rgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  }
  let r, g, b;
  if (s == 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return `rgba(${r * 255},${g * 255},${b * 255},${a})`;
}

function colorToRgb(val) {
  if (is.rgb(val)) return rgbToRgba(val);
  if (is.hex(val)) return hexToRgba(val);
  if (is.hsl(val)) return hslToRgba(val);
}

// Units

function getUnit(val) {
  const split = /([\+\-]?[0-9#\.]+)(%|px|pt|em|rem|in|cm|mm|ex|ch|pc|vw|vh|vmin|vmax|deg|rad|turn)?$/.exec(val);
  if (split) return split[2];
}

function getTransformUnit(propName) {
  if (stringContains(propName, 'translate') || propName === 'perspective') return 'px';
  if (stringContains(propName, 'rotate') || stringContains(propName, 'skew')) return 'deg';
}

// Values

function getFunctionValue(val, animatable) {
  if (!is.fnc(val)) return val;
  return val(animatable.target, animatable.id, animatable.total);
}

function getAttribute(el, prop) {
  return el.getAttribute(prop);
}

function convertPxToUnit(el, value, unit) {
  const valueUnit = getUnit(value);
  if (arrayContains([unit, 'deg', 'rad', 'turn'], valueUnit)) return value;
  const cached = cache.CSS[value + unit];
  if (!is.und(cached)) return cached;
  const baseline = 100;
  const tempEl = document.createElement(el.tagName);
  const parentEl = (el.parentNode && (el.parentNode !== document)) ? el.parentNode : document.body;
  parentEl.appendChild(tempEl);
  tempEl.style.position = 'absolute';
  tempEl.style.width = baseline + unit;
  const factor = baseline / tempEl.offsetWidth;
  parentEl.removeChild(tempEl);
  const convertedUnit = factor * parseFloat(value);
  cache.CSS[value + unit] = convertedUnit;
  return convertedUnit;
}

function getCSSValue(el, prop, unit) {
  if (prop in el.style) {
    const uppercasePropName = prop.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    const value = el.style[prop] || getComputedStyle(el).getPropertyValue(uppercasePropName) || '0';
    return unit ? convertPxToUnit(el, value, unit) : value;
  }
}

function getAnimationType(el, prop) {
  if (is.dom(el) && !is.inp(el) && (getAttribute(el, prop) || (is.svg(el) && el[prop]))) return 'attribute';
  if (is.dom(el) && arrayContains(validTransforms, prop)) return 'transform';
  if (is.dom(el) && (prop !== 'transform' && getCSSValue(el, prop))) return 'css';
  if (el[prop] != null) return 'object';
}

function getElementTransforms(el) {
  if (!is.dom(el)) return;
  const str = el.style.transform || '';
  const reg  = /(\w+)\(([^)]*)\)/g;
  const transforms = new Map();
  let m; while (m = reg.exec(str)) transforms.set(m[1], m[2]);
  return transforms;
}

function getTransformValue(el, propName, animatable, unit) {
  const defaultVal = stringContains(propName, 'scale') ? 1 : 0 + getTransformUnit(propName);
  const value = getElementTransforms(el).get(propName) || defaultVal;
  animatable.transforms.list.set(propName, value);
  animatable.transforms['last'] = propName;
  return unit ? convertPxToUnit(el, value, unit) : value;
}

function getOriginalTargetValue(target, propName, unit, animatable) {
  switch (getAnimationType(target, propName)) {
    case 'transform': return getTransformValue(target, propName, animatable, unit);
    case 'css': return getCSSValue(target, propName, unit);
    case 'attribute': return getAttribute(target, propName);
    default: return target[propName] || 0;
  }
}

function getRelativeValue(to, from) {
  const operator = /^(\*=|\+=|-=)/.exec(to);
  if (!operator) return to;
  const u = getUnit(to) || 0;
  const x = parseFloat(from);
  const y = parseFloat(to.replace(operator[0], ''));
  switch (operator[0][0]) {
    case '+': return x + y + u;
    case '-': return x - y + u;
    case '*': return x * y + u;
  }
}

function validateValue(val, unit) {
  if (is.col(val)) return colorToRgb(val);
  const originalUnit = getUnit(val);
  const unitLess = originalUnit ? val.substr(0, val.length - originalUnit.length) : val;
  return unit && !/\s/g.test(val) ? unitLess + unit : unitLess;
}

// getTotalLength() equivalent for circle, rect, polyline, polygon and line shapes
// adapted from https://gist.github.com/SebLambla/3e0550c496c236709744

function getDistance(p1, p2) {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

function getCircleLength(el) {
  return Math.PI * 2 * getAttribute(el, 'r');
}

function getRectLength(el) {
  return (getAttribute(el, 'width') * 2) + (getAttribute(el, 'height') * 2);
}

function getLineLength(el) {
  return getDistance(
    {x: getAttribute(el, 'x1'), y: getAttribute(el, 'y1')}, 
    {x: getAttribute(el, 'x2'), y: getAttribute(el, 'y2')}
  );
}

function getPolylineLength(el) {
  const points = el.points;
  let totalLength = 0;
  let previousPos;
  for (let i = 0 ; i < points.numberOfItems; i++) {
    const currentPos = points.getItem(i);
    if (i > 0) totalLength += getDistance(previousPos, currentPos);
    previousPos = currentPos;
  }
  return totalLength;
}

function getPolygonLength(el) {
  const points = el.points;
  return getPolylineLength(el) + getDistance(points.getItem(points.numberOfItems - 1), points.getItem(0));
}

// Path animation

function getTotalLength(el) {
  if (el.getTotalLength) return el.getTotalLength();
  switch(el.tagName.toLowerCase()) {
    case 'circle': return getCircleLength(el);
    case 'rect': return getRectLength(el);
    case 'line': return getLineLength(el);
    case 'polyline': return getPolylineLength(el);
    case 'polygon': return getPolygonLength(el);
  }
}

function setDashoffset(el) {
  const pathLength = getTotalLength(el);
  el.setAttribute('stroke-dasharray', pathLength);
  return pathLength;
}

// Motion path

function getParentSvgEl(el) {
  let parentEl = el.parentNode;
  while (is.svg(parentEl)) {
    parentEl = parentEl.parentNode;
    if (!is.svg(parentEl.parentNode)) break;
  }
  return parentEl;
}

function getParentSvg(pathEl, svgData) {
  const svg = svgData || {};
  const parentSvgEl = svg.el || getParentSvgEl(pathEl);
  const rect = parentSvgEl.getBoundingClientRect();
  const viewBoxAttr = getAttribute(parentSvgEl, 'viewBox');
  const width = rect.width;
  const height = rect.height;
  const viewBox = svg.viewBox || (viewBoxAttr ? viewBoxAttr.split(' ') : [0, 0, width, height]);
  return {
    el: parentSvgEl,
    viewBox: viewBox,
    x: viewBox[0] / 1,
    y: viewBox[1] / 1,
    w: width / viewBox[2],
    h: height / viewBox[3]
  }
}

function getPath(path, percent) {
  const pathEl = is.str(path) ? selectString(path)[0] : path;
  const p = percent || 100;
  return function(property) {
    return {
      property,
      el: pathEl,
      svg: getParentSvg(pathEl),
      totalLength: getTotalLength(pathEl) * (p / 100)
    }
  }
}

function getPathProgress(path, progress) {
  function point(offset = 0) {
    const l = progress + offset >= 1 ? progress + offset : 0;
    return path.el.getPointAtLength(l);
  }
  const svg = getParentSvg(path.el, path.svg)
  const p = point();
  const p0 = point(-1);
  const p1 = point(+1);
  switch (path.property) {
    case 'x': return (p.x - svg.x) * svg.w;
    case 'y': return (p.y - svg.y) * svg.h;
    case 'angle': return Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180 / Math.PI;
  }
}

// Decompose value

function decomposeValue(val, unit) {
  const rgx = /-?\d*\.?\d+/g;
  const value = validateValue((is.pth(val) ? val.totalLength : val), unit) + '';
  return {
    original: value,
    numbers: value.match(rgx) ? value.match(rgx).map(Number) : [0],
    strings: (is.str(val) || unit) ? value.split(rgx) : []
  }
}

// Animatables

function parseTargets(targets) {
  const targetsArray = targets ? (flattenArray(is.arr(targets) ? targets.map(toArray) : toArray(targets))) : [];
  return filterArray(targetsArray, (item, pos, self) => self.indexOf(item) === pos);
}

function getAnimatables(targets) {
  const parsed = parseTargets(targets);
  return parsed.map((t, i) => {
    return {target: t, id: i, total: parsed.length, transforms: { list: getElementTransforms(t) } };
  });
}

// Properties

function normalizePropertyTweens(prop, tweenSettings) {
  let settings = cloneObject(tweenSettings);
  // Override duration if easing is a spring
  if (/^spring/.test(settings.easing)) settings.duration = spring(settings.easing);
  if (is.arr(prop)) {
    const l = prop.length;
    const isFromTo = (l === 2 && !is.obj(prop[0]));
    if (!isFromTo) {
      // Duration divided by the number of tweens
      if (!is.fnc(tweenSettings.duration)) settings.duration = tweenSettings.duration / l;
    } else {
      // Transform [from, to] values shorthand to a valid tween value
      prop = {value: prop};
    }
  }
  const propArray = is.arr(prop) ? prop : [prop];
  return propArray.map((v, i) => {
    const obj = (is.obj(v) && !is.pth(v)) ? v : {value: v};
    // Default delay value should only be applied to the first tween
    if (is.und(obj.delay)) obj.delay = !i ? tweenSettings.delay : 0;
    // Default endDelay value should only be applied to the last tween
    if (is.und(obj.endDelay)) obj.endDelay = i === propArray.length - 1 ? tweenSettings.endDelay : 0;
    return obj;
  }).map(k => mergeObjects(k, settings));
}

function flattenKeyframes(keyframes) {
  const propertyNames = filterArray([...new Set(flattenArray(keyframes.map(key => { 
    return Object.keys(key).map(p => { if (is.key(p)) return p }); 
  })))], a => !is.und(a));
  const properties = {};
  for (let i = 0; i < propertyNames.length; i++) {
    const propName = propertyNames[i];
    properties[propName] = keyframes.map(key => {
      const newKey = {};
      for (let p in key) {
        if (is.key(p)) {
          if (p == propName) newKey.value = key[p];
        } else {
          newKey[p] = key[p];
        }
      }
      return newKey;
    });
  }
  return properties;
}

function getProperties(tweenSettings, params) {
  const properties = [];
  const keyframes = params.keyframes;
  if (keyframes) params = mergeObjects(flattenKeyframes(keyframes), params);;
  for (let p in params) {
    if (is.key(p)) {
      properties.push({
        name: p,
        tweens: normalizePropertyTweens(params[p], tweenSettings)
      });
    }
  }
  return properties;
}

// Tweens

function normalizeTweenValues(tween, animatable) {
  const t = {};
  for (let p in tween) {
    let value = getFunctionValue(tween[p], animatable);
    if (is.arr(value)) {
      value = value.map(v => getFunctionValue(v, animatable));
      if (value.length === 1) value = value[0];
    }
    t[p] = value;
  }
  t.duration = parseFloat(t.duration);
  t.delay = parseFloat(t.delay);
  return t;
}

function normalizeTweens(prop, animatable) {
  let previousTween;
  return prop.tweens.map(t => {
    const tween = normalizeTweenValues(t, animatable);
    const tweenValue = tween.value;
    let to = is.arr(tweenValue) ? tweenValue[1] : tweenValue;
    const toUnit = getUnit(to);
    const originalValue = getOriginalTargetValue(animatable.target, prop.name, toUnit, animatable);
    const previousValue = previousTween ? previousTween.to.original : originalValue;
    const from = is.arr(tweenValue) ? tweenValue[0] : previousValue;
    const fromUnit = getUnit(from) || getUnit(originalValue);
    const unit = toUnit || fromUnit;
    if (is.und(to)) to = previousValue;
    tween.from = decomposeValue(from, unit);
    tween.to = decomposeValue(getRelativeValue(to, from), unit);
    tween.start = previousTween ? previousTween.end : 0;
    tween.end = tween.start + tween.delay + tween.duration + tween.endDelay;
    tween.easing = parseEasings(tween.easing, tween.duration);
    tween.isPath = is.pth(tweenValue);
    tween.isColor = is.col(tween.from.original);
    if (tween.isColor) tween.round = 1;
    previousTween = tween;
    return tween;
  });
}

// Tween progress

const setProgressValue = {
  css: (t, p, v) => t.style[p] = v,
  attribute: (t, p, v) => t.setAttribute(p, v),
  object: (t, p, v) => t[p] = v,
  transform: (t, p, v, transforms, manual) => {
    transforms.list.set(p, v);
    if (p === transforms.last || manual) {
      let str = '';
      transforms.list.forEach((value, prop) => { str += `${prop}(${value}) `; });
      t.style.transform = str;
    }
  }
}

// Set Value helper

function setTargetValue(targets, properties) {
  const animatables = getAnimatables(targets);
  animatables.forEach(animatable => {
    for (let property in properties) {
      const value = getFunctionValue(properties[property], animatable);
      const target = animatable.target;
      const valueUnit = getUnit(value);
      const originalValue = getOriginalTargetValue(target, property, valueUnit, animatable);
      const unit = valueUnit || getUnit(originalValue);
      const to = getRelativeValue(validateValue(value, unit), originalValue);
      const animType = getAnimationType(target, property);
      setProgressValue[animType](target, property, to, animatable.transforms, true);
    }
  });
}

// Animations

function createAnimation(animatable, prop) {
  const animType = getAnimationType(animatable.target, prop.name);
  if (animType) {
    const tweens = normalizeTweens(prop, animatable);
    const lastTween = tweens[tweens.length - 1];
    return {
      type: animType,
      property: prop.name,
      animatable: animatable,
      tweens: tweens,
      duration: lastTween.end,
      delay: tweens[0].delay,
      endDelay: lastTween.endDelay
    }
  }
}

function getAnimations(animatables, properties) {
  return filterArray(flattenArray(animatables.map(animatable => {
    return properties.map(prop => {
      return createAnimation(animatable, prop);
    });
  })), a => !is.und(a));
}

// Create Instance

function getStates(params) {
  const statesParams = params.states;
  if (!statesParams) return;
  let instanceParams = cloneObject(params);
  delete instanceParams.states;
  let states = {default: instanceParams};
  for (let state in statesParams) {
    states[state] = cloneObject(instanceParams);
    let stateParams = statesParams[state];
    for (let p in stateParams) {
      states[state][p] = stateParams[p];
    }
  }
  return states;
}

function getInstanceTimings(animations, tweenSettings) {
  const animLength = animations.length;
  const getTlOffset = anim => anim.timelineOffset ? anim.timelineOffset : 0;
  const timings = {};
  timings.duration = animLength ? Math.max.apply(Math, animations.map(anim => getTlOffset(anim) + anim.duration)) : tweenSettings.duration;
  timings.delay = animLength ? Math.min.apply(Math, animations.map(anim => getTlOffset(anim) + anim.delay)) : tweenSettings.delay;
  timings.endDelay = animLength ? timings.duration - Math.max.apply(Math, animations.map(anim => getTlOffset(anim) + anim.duration - anim.endDelay)) : tweenSettings.endDelay;
  return timings;
}

let instanceID = 0;

function createNewInstance(params) {
  const instanceSettings = replaceObjectProps(defaultInstanceSettings, params);
  const tweenSettings = replaceObjectProps(defaultTweenSettings, params);
  const properties = getProperties(tweenSettings, params);
  const animatables = getAnimatables(params.targets);
  const animations = getAnimations(animatables, properties);
  const timings = getInstanceTimings(animations, tweenSettings);
  const id = instanceID;
  instanceID++;
  return mergeObjects(instanceSettings, {
    id: id,
    children: [],
    states: getStates(params),
    currentState: null,
    animatables: animatables,
    animations: animations,
    duration: timings.duration,
    delay: timings.delay,
    endDelay: timings.endDelay
  });
}

// Core

let activeInstances = [];
let pausedInstances = [];
let raf;

const engine = (() => {
  function play() { 
    raf = requestAnimationFrame(step);
  }
  function step(t) {
    let activeInstancesLength = activeInstances.length;
    if (activeInstancesLength) {
      let i = 0;
      while (i < activeInstancesLength) {
        const activeInstance = activeInstances[i];
        if (!activeInstance.paused) {
          activeInstance.tick(t);
        } else {
          const instanceIndex = activeInstances.indexOf(activeInstance);
          if (instanceIndex > -1) {
            activeInstances.splice(instanceIndex, 1);
            activeInstancesLength = activeInstances.length;
          }
        }
        i++;
      }
      play();
    } else {
      raf = cancelAnimationFrame(raf);
    }
  }
  return play;
})();

function handleVisibilityChange() {
  if (document.hidden) {
    activeInstances.forEach(ins => ins.pause());
    pausedInstances = activeInstances.slice(0);
    activeInstances = [];
  } else {
    pausedInstances.forEach(ins => ins.play());
  }
}

document.addEventListener('visibilitychange', handleVisibilityChange);

// Public Instance

function anime(params = {}) {

  let startTime = 0, lastTime = 0, now = 0;
  let children, childrenLength = 0;
  let resolve = null;

  function makePromise() {
    return window.Promise && new Promise(_resolve => resolve = _resolve);
  }

  let promise = makePromise();

  let instance = createNewInstance(params);

  function toggleInstanceDirection() {
    instance.reversed = !instance.reversed;
    children.forEach(child => child.reversed = instance.reversed);
  }

  function adjustTime(time) {
    return instance.reversed ? instance.duration - time : time;
  }

  function resetTime() {
    startTime = 0;
    lastTime = adjustTime(instance.currentTime) * (1 / anime.speed);
  }

  function syncInstanceChildren(time) {
    for (let i = 0; i < childrenLength; i++) {
      const child = children[i];
      child.seek(time - child.timelineOffset);
    }
  }

  function setAnimationsProgress(insTime) {
    let i = 0;
    const animations = instance.animations;
    const animationsLength = animations.length;
    while (i < animationsLength) {
      const anim = animations[i];
      const animatable = anim.animatable;
      const tweens = anim.tweens;
      const tweenLength = tweens.length - 1;
      let tween = tweens[tweenLength];
      // Only check for keyframes if there is more than one tween
      if (tweenLength) tween = filterArray(tweens, t => (insTime < t.end))[0] || tween;
      const elapsed = minMax(insTime - tween.start - tween.delay, 0, tween.duration) / tween.duration;
      const eased = isNaN(elapsed) ? 1 : tween.easing(elapsed);
      const strings = tween.to.strings;
      const round = tween.round;
      const numbers = [];
      const toNumbersLength = tween.to.numbers.length;
      let progress;
      for (let n = 0; n < toNumbersLength; n++) {
        let value;
        const toNumber = tween.to.numbers[n];
        const fromNumber = tween.from.numbers[n] || 0;
        if (!tween.isPath) {
          value = fromNumber + (eased * (toNumber - fromNumber));
        } else {
          value = getPathProgress(tween.value, eased * toNumber);
        }
        if (round) {
          if (!(tween.isColor && n > 2)) {
            value = Math.round(value * round) / round;
          }
        }
        numbers.push(value);
      }
      // Manual Array.reduce for better performances
      const stringsLength = strings.length;
      if (!stringsLength) {
        progress = numbers[0];
      } else {
        progress = strings[0];
        for (let s = 0; s < stringsLength; s++) {
          const a = strings[s];
          const b = strings[s + 1];
          const n = numbers[s];
          if (!isNaN(n)) {
            if (!b) {
              progress += n + ' ';
            } else {
              progress += n + b;
            }
          }
        }
      }
      setProgressValue[anim.type](animatable.target, anim.property, progress, animatable.transforms);
      anim.currentValue = progress;
      i++;
    }
  }

  function setCallback(cb) {
    if (instance[cb] && !instance.passthrough) instance[cb](instance);
  }

  function countIteration() {
    if (instance.remaining && instance.remaining !== true) {
      instance.remaining--;
    }
  }

  function setInstanceProgress(engineTime) {
    const insDuration = instance.duration;
    const insDelay = instance.delay;
    const insEndDelay = insDuration - instance.endDelay;
    const insReversed = instance.reversed;
    const insTime = adjustTime(engineTime);
    instance.progress = minMax((insTime / insDuration) * 100, 0, 100);
    if (!instance.began) {
      instance.began = true;
      setCallback('begin');
      setCallback('loopBegin');
    }
    if (
      (!instance.changeBegan && !insReversed && insTime >= insDelay && insTime <= insEndDelay) || 
      (!instance.changeBegan && insReversed && insTime <= insEndDelay && insTime >= insDelay)) {
      instance.changeBegan = true;
      instance.changeCompleted = false;
      setCallback('changeBegin');
    }
    if ((insTime >= insDelay && insTime <= insEndDelay)) {
      setCallback('change');
    }
    if (
      (!instance.changeCompleted && !insReversed && insTime >= insEndDelay) || 
      (!instance.changeCompleted && insReversed && insTime <= insDelay)) {
      instance.changeCompleted = true;
      instance.changeBegan = false;
      setCallback('changeComplete');
    }
    if (children) { syncInstanceChildren(insTime); };
    if (insTime >= insDelay && insTime <= insDuration) {
      setAnimationsProgress(insTime);
    } else {
      if ((insTime >= insDuration && instance.currentTime !== insDuration) || !insDuration) {
        setAnimationsProgress(insDuration);
      }
      if (insTime <= insDelay && instance.currentTime !== 0) {
        setAnimationsProgress(0);
      }
    }
    instance.currentTime = minMax(insTime, 0, insDuration);
    setCallback('update');
    if (engineTime >= insDuration) {
      lastTime = 0;
      setCallback('loopComplete');
      countIteration();
      if (instance.remaining) {
        startTime = now;
        setCallback('loopBegin');
        if (instance.direction === 'alternate') { toggleInstanceDirection(); }
      } else {
        instance.paused = true;
        if (!instance.completed) {
          instance.completed = true;
          setCallback('complete');
          if ('Promise' in window) {
            resolve();
            promise = makePromise();
          }
        }
      }
    }
  }

  instance.reset = function() {
    const direction = instance.direction;
    const loops = instance.loop;
    instance.passthrough = false;
    instance.currentTime = 0;
    instance.progress = 0;
    instance.paused = true;
    instance.began = false;
    instance.changeBegan = false;
    instance.changeCompleted = false;
    instance.completed = false;
    instance.reversed = direction === 'reverse';
    instance.remaining = direction === 'alternate' && loops === 1 ? 2 : loops;
    children = instance.children;
    childrenLength = children.length;
    for (let i = childrenLength; i--;) instance.children[i].reset();
    setAnimationsProgress(0);
  }

  instance.tick = function(t) {
    now = t;
    if (!startTime) startTime = now;
    setInstanceProgress((now + (lastTime - startTime)) * anime.speed);
  }

  instance.seek = function(time) {
    setInstanceProgress(adjustTime(time));
  }

  instance.pause = function() {
    instance.paused = true;
    resetTime();
  }

  instance.play = function() {
    if (!instance.paused) return;
    instance.paused = false;
    activeInstances.push(instance);
    resetTime();
    if (!raf) engine();
  }

  instance.reverse = function() {
    toggleInstanceDirection();
    resetTime();
  }

  instance.restart = function() {
    instance.reset();
    instance.play();
  }

  instance.animateTo = function(stateName, paramsOverrides) {
    let state = instance.states[stateName];
    if (!state) return;
    if (paramsOverrides) state = mergeObjects(paramsOverrides, state);
    instance.pause();
    const animation = anime(state);
    animation.currentState = stateName;
    return animation;
  }

  instance.goTo = function(stateName, paramsOverrides) {
    const stateAnimation = instance.animateTo(stateName, paramsOverrides);
    stateAnimation.seek(stateAnimation.duration);
    return stateAnimation;
  }

  instance.finished = promise;

  instance.reset();

  if (instance.startTime) {
    // if startTime > instance duration, simulate a loop
    setInstanceProgress(instance.startTime - (instance.duration * Math.floor(instance.startTime / instance.duration)));
    resetTime();
  }

  if (instance.states) {
    // Initialize default state
    instance.goTo('default');
  }

  if (instance.autoplay && !instance.states) instance.play();

  return instance;

}

// Remove targets from animation

function removeTargetsFromAnimations(targetsArray, animations) {
  for (let a = animations.length; a--;) {
    if (arrayContains(targetsArray, animations[a].animatable.target)) {
      animations.splice(a, 1);
    }
  }
}

function removeTargets(targets) {
  const targetsArray = parseTargets(targets);
  for (let i = activeInstances.length; i--;) {
    const instance = activeInstances[i];
    const animations = instance.animations;
    const children = instance.children;
    removeTargetsFromAnimations(targetsArray, animations);
    for (let c = children.length; c--;) {
      const child = children[c];
      const childAnimations = child.animations;
      removeTargetsFromAnimations(targetsArray, childAnimations);
      if (!childAnimations.length && !child.children.length) children.splice(c, 1);
    }
    if (!animations.length && !children.length) instance.pause();
  }
}

// Stagger helpers

function stagger(val, params = {}) {
  const direction = params.direction || 'normal';
  const easing = params.easing ? parseEasings(params.easing) : null;
  const grid = params.grid;
  const axis = params.axis;
  let fromIndex = params.from || 0;
  const fromFirst = fromIndex === 'first';
  const fromCenter = fromIndex === 'center';
  const fromLast = fromIndex === 'last';
  const isRange = is.arr(val);
  const val1 = isRange ? parseFloat(val[0]) : parseFloat(val);
  const val2 = isRange ? parseFloat(val[1]) : 0;
  const unit = getUnit(isRange ? val[1] : val) || 0;
  const start = params.start || 0 + (isRange ? val1 : 0);
  let values = [];
  let maxValue = 0;
  return (el, i, t) => {
    if (fromFirst) fromIndex = 0;
    if (fromCenter) fromIndex = (t - 1) / 2;
    if (fromLast) fromIndex = t - 1;
    if (!values.length) {
      for (let index = 0; index < t; index++) {
        if (!grid) {
          values.push(Math.abs(fromIndex - index));
        } else {
          const fromX = !fromCenter ? fromIndex%grid[0] : (grid[0]-1)/2;
          const fromY = !fromCenter ? Math.floor(fromIndex/grid[0]) : (grid[1]-1)/2;
          const toX = index%grid[0];
          const toY = Math.floor(index/grid[0]);
          const distanceX = fromX - toX;
          const distanceY = fromY - toY;
          let value = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
          if (axis === 'x') value = -distanceX;
          if (axis === 'y') value = -distanceY;
          values.push(value);
        }
        maxValue = Math.max(...values);
      }
      if (easing) values = values.map(val => easing(val / maxValue) * maxValue);
      if (direction === 'reverse') values = values.map(val => axis ? (val < 0) ? val * -1 : -val : Math.abs(maxValue - val));
    }
    const spacing = isRange ? (val2 - val1) / maxValue : val1;
    return start + (spacing * (Math.round(values[i] * 100) / 100)) + unit;
  }
}

// Timeline

function timeline(params = {}) {
  let tl = anime(params);
  tl.duration = 0;
  tl.add = function(instanceParams, timelineOffset) {
    const tlIndex = activeInstances.indexOf(tl);
    const children = tl.children;
    if (tlIndex > -1) activeInstances.splice(tlIndex, 1);
    function passThrough(ins) { ins.passthrough = true; };
    for (let i = 0; i < children.length; i++) passThrough(children[i]);
    let insParams = mergeObjects(instanceParams, replaceObjectProps(defaultTweenSettings, params));
    insParams.targets = insParams.targets || params.targets;
    const tlDuration = tl.duration;
    insParams.autoplay = false;
    insParams.direction = tl.direction;
    insParams.timelineOffset = is.und(timelineOffset) ? tlDuration : getRelativeValue(timelineOffset, tlDuration);
    passThrough(tl);
    tl.seek(insParams.timelineOffset);
    const ins = anime(insParams);
    passThrough(ins);
    const totalDuration = ins.duration + insParams.timelineOffset;
    children.push(ins);
    const timings = getInstanceTimings(children, params);
    tl.delay = timings.delay;
    tl.endDelay = timings.endDelay;
    tl.duration = timings.duration;
    tl.seek(0);
    tl.reset();
    if (tl.autoplay) tl.play();
    return tl;
  }
  return tl;
}

anime.version = '3.0.0';
anime.speed = 1;
anime.running = activeInstances;
anime.remove = removeTargets;
anime.getValue = getOriginalTargetValue;
anime.setValue = setTargetValue;
anime.convertPx = convertPxToUnit;
anime.path = getPath;
anime.setDashoffset = setDashoffset;
anime.stagger = stagger;
anime.timeline = timeline;
anime.easing = parseEasings;
anime.penner = penner;
anime.random = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

export default anime;