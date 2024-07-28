/**
 * Cross-platform utilities for unit testing.
 *
 * Copyright Danny Lin 2024
 * Distributed under the MIT License
 * https://opensource.org/licenses/MIT
 */
(function (global, factory) {
  if (typeof exports === "object" && typeof module === "object") {
    // CommonJS
    module.exports = factory(
      require('../t/common', '../shared/lib/sha'),
    );
  } else if (typeof define === "function" && define.amd) {
    // AMD
    define(['../t/common', '../shared/lib/sha'], factory);
  } else {
    // Browser globals
    global = typeof globalThis !== "undefined" ? globalThis : global || self;
    global.unittest = factory(
      global.utils,
      global.jsSHA,
    );
  }
}(this, function (utils, jsSHA) {

  'use strict';

  class AssertionError extends Error {
    constructor(...args) {
      super(...args);
      this.name = 'AssertionError';
      this.message = this.message || "Assertion failed";
    }
  }

  /**
   * Simple assertion that outputs the error to the console for later tracing.
   */
  function assert(condition, message) {
    if (condition) { return; }
    const err = new AssertionError(message);
    console.error(err);
    throw err;
  }

  /**
   * Check two objects (JSONifiable) are deeply identical.
   */
  function assertEqual(obj1, obj2, message) {
    const s1 = JSON.stringify(obj1);
    const s2 = JSON.stringify(obj2);
    if (s1 === s2) { return; }
    const err = new AssertionError(`${s1} not equal to ${s2}${message ? ': ' + message : ''}`);
    err.actual = JSON.stringify(obj1, null, 2);
    err.expected = JSON.stringify(obj2, null, 2);
    console.error(err);
    throw err;
  }

  /**
   * An Error object that the thrown error object must be an instance of it.
   *
   * @typedef {Error} assertThrowsError
   */

  /**
   * An object that each property is tested against the thrown error object.
   *
   * If the property value is a RegExp, the error property value must match it;
   * otherwise the error property value must be equal to it.
   *
   * @typedef {Object<string, (RegExp|*)>} assertThrowsSpec
   */

  /**
   * @callback assertThrowsCallback
   * @param {Error} [error] - the thrown error object to be tested
   * @return {boolean} Truthy to pass the assersion.
   */

  /**
   * Check if the function throws with the exception
   *
   * @param {Function} func - the function to test
   * @param {assertThrowsError|assertThrowsSpec|assertThrowsCallback} [expected]
   *     the expected error
   */
  function assertThrows(func, expected, message) {
    let error;
    try {
      func();
    } catch (ex) {
      error = ex;
    }
    if (!error) {
      throw new AssertionError(`Expected error not thrown${message ? ': ' + message : ''}`);
    }
    if (!expected) { return; }
    if (expected.prototype instanceof Error) {
      if (!(error instanceof expected)) {
        throw new AssertionError(`Thrown error ${String(error)} is not an instance of ${expected.name}${message ? ': ' + message : ''}`);
      }
    } else if (typeof expected === 'function') {
      if (!expected(error)) {
        throw new AssertionError(`Thrown error ${String(error)} is not expected${message ? ': ' + message : ''}`);
      }
    } else {
      for (const key in expected) {
        const value = expected[key];
        const valueError = error[key];
        if (value instanceof RegExp) {
          if (!value.test(valueError)) {
            throw new AssertionError(`Thrown error property "${key}" ${JSON.stringify(valueError)} does not match ${value.toString()}${message ? ': ' + message : ''}`);
          }
        } else {
          if (valueError !== value) {
            throw new AssertionError(`Thrown error property "${key}" ${JSON.stringify(valueError)} not equal to ${JSON.stringify(value)}${message ? ': ' + message : ''}`);
          }
        }
      }
    }
  }

  /**
   * A jQuery-style extension of describe or it for chainable and conditional
   * skip or xfail.
   *
   * Also globally exposed as:
   *   - $it = $(it) = MochaQuery(it)
   *   - $describe = $(describe) = MochaQuery(describe)
   *
   * Usage:
   *   .skip([reason])           // skip (if not yet skipped)
   *   .skipIf(cond [, reason])  // skip if cond (and not yet skipped)
   *   .xfail([reason])          // expect fail (if not yet skipped/xfailed)
   *   .xfailIf(cond, [reason])  // expect fail if cond (and not yet skipped/xfailed)
   *
   *   $it
   *     .skipIf(cond1, skipReason1)
   *     .skipIf(cond2, skipReason2)
   *     .xfail(xfailReason)
   *     (title, callback)
   *
   *   $describe
   *     .skipIf(cond1, skipReason1)
   *     .skipIf(cond2, skipReason2)
   *     (title, callback)
   */
  function MochaQuery(func, data = {}) {
    return data.proxy = new Proxy(func, Object.entries(MochaQuery.handler).reduce((obj, [key, value]) => {
      obj[key] = value.bind(this, data);
      return obj;
    }, {}));
  }

  MochaQuery.handler = {
    get(data, func, prop) {
      if (prop in MochaQuery.methods) {
        return MochaQuery(func, Object.assign({}, data, {method: prop}));
      }
      return Reflect.get(func, prop);
    },
    apply(data, func, thisArg, args) {
      const methods = MochaQuery.methods, method = methods[data.method];
      if (method) {
        const d = Object.assign({}, data, {method: null});
        method.call(methods, d, ...args);
        return MochaQuery(func, d);
      }

      const [title, callback] = args;
      switch (data.mode) {
        case 'skip': {
          const reason = data.reason ? ` (${data.reason})` : '';
          const titleNew = `${title} - skipped${reason}`;
          return func.skip.call(thisArg, titleNew, callback);
        }
        case 'xfail': {
          const reason = data.reason ? ` (${data.reason})` : '';
          const titleNew = `${title} - expected failure${reason}`;
          const callbackNew = async function (...args) {
            try {
              await callback.apply(this, args);
            } catch (ex) {
              return;
            }
            throw new Error('unexpected success');
          };
          callbackNew.toString = () => callback.toString();
          return func.call(thisArg, titleNew, callbackNew);
        }
      }

      return Reflect.apply(func, thisArg, args);
    },
  };

  MochaQuery.methods = {
    skip(data, reason) {
      if (data.mode === 'skip') { return; }
      data.mode = 'skip';
      data.reason = reason;
    },
    skipIf(data, condition, reason) {
      if (data.mode === 'skip') { return; }
      if (condition instanceof MochaQuery.Query) {
        [condition, reason] = [condition.condition, reason || condition.reason];
      }
      if (!condition) { return; }
      data.mode = 'skip';
      data.reason = reason;
    },
    xfail(data, reason) {
      if (data.mode) { return; }
      data.mode = 'xfail';
      data.reason = reason;
    },
    xfailIf(data, condition, reason) {
      if (data.mode) { return; }
      if (condition instanceof MochaQuery.Query) {
        [condition, reason] = [condition.condition, reason || condition.reason];
      }
      if (!condition) { return; }
      data.mode = 'xfail';
      data.reason = reason;
    },
  };

  MochaQuery.Query = class Query {
    constructor(condition, reason) {
      this.condition = condition;
      this.reason = reason;
    }
  };

  Object.defineProperties(MochaQuery, Object.getOwnPropertyDescriptors({
    get noBrowser() {
      const value = new MochaQuery.Query(
        !(typeof window !== 'undefined' && typeof navigator !== 'undefined' && window.document),
        'no browser environment',
      );
      Object.defineProperty(this, 'noBrowser', {value});
      return value;
    },
    get noMultipleSelection() {
      const value = this.noBrowser.condition ? this.noBrowser : new MochaQuery.Query(
        (() => {
          const sel = document.getSelection();
          const origCount = sel.rangeCount;
          if (origCount > 1) {
            return false;
          }
          const origRanges = [];
          for (let i = 0; i < origCount; i++) {
            origRanges.push(sel.getRangeAt(i));
          }
          const dummyTextNode = document.createTextNode('dummy');
          try {
            document.body.appendChild(dummyTextNode);

            let range = document.createRange();
            range.setStart(dummyTextNode, 0);
            range.setEnd(dummyTextNode, 1);
            sel.addRange(range);

            range = document.createRange();
            range.setStart(dummyTextNode, 2);
            range.setEnd(dummyTextNode, 3);
            sel.addRange(range);

            if (sel.rangeCount <= 1) {
              return true;
            }
          } finally {
            sel.removeAllRanges();
            for (let i = 0; i < origCount; i++) {
              sel.addRange(origRanges[i]);
            }
            dummyTextNode.remove();
          }
          return false;
        })(),
        'multiple selection not supported',
      );
      Object.defineProperty(this, 'noMultipleSelection', {value});
      return value;
    },
    get noShadowRootClonable() {
      // ShadowRoot.clonable is not supported by Chromium < 124 and Firefox < 123.
      const value = this.noBrowser.condition ? this.noBrowser : new MochaQuery.Query(
        (() => {
          const div = document.createElement('div');
          const shadowRoot = div.attachShadow({mode: 'open', clonable: true});
          return typeof shadowRoot.clonable === 'undefined';
        })(),
        'ShadowRoot.clonable not supported',
      );
      Object.defineProperty(this, 'noShadowRootClonable', {value});
      return value;
    },
    get noShadowRootDelegatesFocus() {
      // ShadowRoot.delegatesFocus is not supported by Firefox < 94.
      const value = this.noBrowser.condition ? this.noBrowser : new MochaQuery.Query(
        (() => {
          const div = document.createElement('div');
          const shadowRoot = div.attachShadow({mode: 'open', delegatesFocus: true});
          return typeof shadowRoot.delegatesFocus === 'undefined';
        })(),
        'ShadowRoot.delegatesFocus not supported',
      );
      Object.defineProperty(this, 'noShadowRootDelegatesFocus', {value});
      return value;
    },
    get noShadowRootSerializable() {
      // ShadowRoot.serializable is not supported by Chromium < 125 and Firefox.
      const value = this.noBrowser.condition ? this.noBrowser : new MochaQuery.Query(
        (() => {
          const div = document.createElement('div');
          const shadowRoot = div.attachShadow({mode: 'open', serializable: true});
          return typeof shadowRoot.serializable === 'undefined';
        })(),
        'ShadowRoot.serializable not supported',
      );
      Object.defineProperty(this, 'noShadowRootSerializable', {value});
      return value;
    },
    get noShadowRootSlotAssignment() {
      // ShadowRoot.slotAssignment is not supported by Chromium < 86 and Firefox < 92.
      const value = this.noBrowser.condition ? this.noBrowser : new MochaQuery.Query(
        (() => {
          const div = document.createElement('div');
          const shadowRoot = div.attachShadow({mode: 'open', slotAssignment: 'manual'});
          return typeof shadowRoot.slotAssignment === 'undefined';
        })(),
        'ShadowRoot.slotAssignment not supported',
      );
      Object.defineProperty(this, 'noShadowRootSlotAssignment', {value});
      return value;
    },
    get noAdoptedStylesheet() {
      // Document.adoptedStyleSheets is not supported by Firefox < 101.
      const value = this.noBrowser.condition ? this.noBrowser : new MochaQuery.Query(
        !document.adoptedStyleSheets,
        'Document.adoptedStyleSheets not supported',
      );
      Object.defineProperty(this, 'noAdoptedStylesheet', {value});
      return value;
    },
    get noNestingCss() {
      // CSS nesting selector is supported in Firefox >= 117 and Chromium >= 120.
      const value = this.noBrowser.condition ? this.noBrowser : new MochaQuery.Query(
        (() => {
          const d = document.implementation.createHTMLDocument();
          const style = d.head.appendChild(d.createElement('style'));
          style.textContent = 'a{b{}}';
          const rule = style.sheet.cssRules[0];
          if (!(rule.cssRules && rule.cssRules[0])) {
            return true;
          }
          return false;
        })(),
        'CSS nesting not supported',
      );
      Object.defineProperty(this, 'noNestingCss', {value});
      return value;
    },
    get noColumnCombinator() {
      const value = this.noBrowser.condition ? this.noBrowser : new MochaQuery.Query(
        (() => {
          try {
            document.querySelector('col || td');
          } catch (ex) {
            return true;
          }
          return false;
        })(),
        'CSS column combinator ("||") not supported',
      );
      Object.defineProperty(this, 'noColumnCombinator', {value});
      return value;
    },
    get noPartPseudo() {
      // :part() CSS pseudo-element is supported in Firefox >= 72 and Chromium >= 73.
      const value = this.noBrowser.condition ? this.noBrowser : new MochaQuery.Query(
        (() => {
          try {
            document.querySelector('::part(dummy)');
          } catch (ex) {
            return true;
          }
          return false;
        })(),
        '::part() CSS pseudo-element not supported',
      );
      Object.defineProperty(this, 'noPartPseudo', {value});
      return value;
    },
    get noIsPseudo() {
      // :is() CSS pseudo-class is supported in Firefox >= 78 and Chromium >= 88.
      const value = this.noBrowser.condition ? this.noBrowser : new MochaQuery.Query(
        (() => {
          try {
            document.querySelector(':is()');
          } catch (ex) {
            return true;
          }
          return false;
        })(),
        ':is() CSS pseudo-class not supported',
      );
      Object.defineProperty(this, 'noIsPseudo', {value});
      return value;
    },
    get noHostContextPseudo() {
      // :host-context() not suported in some browsers (e.g. Firefox)
      const value = this.noBrowser.condition ? this.noBrowser : new MochaQuery.Query(
        (() => {
          try {
            document.querySelector(':host-context(*)');
          } catch (ex) {
            return true;
          }
          return false;
        })(),
        ':host-context() CSS pseudo-class not supported',
      );
      Object.defineProperty(this, 'noHostContextPseudo', {value});
      return value;
    },
    get noAtCounterStyle() {
      const value = this.noBrowser.condition ? this.noBrowser : new MochaQuery.Query(
        (() => {
          const d = document.implementation.createHTMLDocument();
          const style = d.head.appendChild(d.createElement('style'));
          style.textContent = '@counter-style my { symbols: "1"; }';
          if (!style.sheet.cssRules.length) {
            return true;
          }
          return false;
        })(),
        '@counter-style CSS rule not supported',
      );
      Object.defineProperty(this, 'noAtCounterStyle', {value});
      return value;
    },
    get noAtLayer() {
      const value = this.noBrowser.condition ? this.noBrowser : new MochaQuery.Query(
        (() => {
          const d = document.implementation.createHTMLDocument();
          const style = d.head.appendChild(d.createElement('style'));
          style.textContent = '@layer mylayer;';
          if (!style.sheet.cssRules.length) {
            return true;
          }
          return false;
        })(),
        '@layer CSS rule not supported',
      );
      Object.defineProperty(this, 'noAtLayer', {value});
      return value;
    },
    get noRegexNamedGroup() {
      const value = this.noBrowser.condition ? this.noBrowser : new MochaQuery.Query(
        (() => {
          try {
            new RegExp('(?<group>foo)\k<group>');
          } catch (ex) {
            return true;
          }
          return false;
        })(),
        'named capture group of RegExp not supported',
      );
      Object.defineProperty(this, 'noRegexNamedGroup', {value});
      return value;
    },
  }));

  function sha1(data, type) {
    let shaObj = new jsSHA("SHA-1", type);
    shaObj.update(data);
    return shaObj.getHash("HEX");
  }

  function getToken(url, role) {
    let token = `${url}\t${role}`;
    token = sha1(token, "TEXT");
    return token;
  }

  function getUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      let r = Math.random()*16|0, v = (c == 'x') ? r : (r&0x3|0x8);
      return v.toString(16);
    });
  }

  function byteStringToArrayBuffer(bstr) {
    let n = bstr.length, u8ar = new Uint8Array(n);
    while (n--) { u8ar[n] = bstr.charCodeAt(n); }
    return u8ar.buffer;
  }

  /**
   * Encode a string into bytes in the specified charset.
   *
   * @param {string} str - the string to encode
   * @param {string} [charset=UTF-8] - the target charset to encode into
   * @param {*} [replacement] - the replacement char for a non-encodable char,
   *     which should be a valid ASCII char. Empty string to replace with
   *     nothing. Falsy to throw an error instead.
   * @return {Promise<Uint8Array>} The encoded bytes.
   */
  var encodeText = (() => {
    function escapeHtml(str) {
      const rv = [];
      for (let i = 0, I = str.length; i < I; i++) {
        const code = str.codePointAt(i);
        if (code > 0xFFFF) { i++; }
        rv.push(`&#${code};`);
      }
      return rv.join('');
    }

    function unescapeHtml(str, replacement) {
      return unescape(str).replace(/&#(?:(\d+)|x([\dA-Fa-f]+));/g, (_, dec, hex) => {
        if (hex) {
          return String.fromCharCode(parseInt(hex, 16));
        }
        if (typeof replacement === 'string') {
          return replacement;
        }
        throw parseInt(dec, 10);
      });
    }

    function byteStringToU8Array(bstr) {
      let n = bstr.length, u8ar = new Uint8Array(n);
      while (n--) { u8ar[n] = bstr.charCodeAt(n); }
      return u8ar;
    }

    async function encodeText(str, charset = "UTF-8", replacement = null) {
      // test if the charset is available
      try {
        new TextDecoder(charset);
      } catch (ex) {
        throw new RangeError(`Specified charset "${charset}" is not supported.`);
      }

      charset = charset.toLowerCase();

      // specially handle Unicode transformations
      // Available UTF names:
      // https://developer.mozilla.org/en-US/docs/Web/API/Encoding_API/Encodings
      if (['utf-8', 'utf8', 'unicode-1-1-utf-8'].includes(charset)) {
        return new TextEncoder().encode(str);
      } else if (['utf-16be', 'utf-16le', 'utf-16'].includes(charset)) {
        const littleEndian = !(charset === 'utf-16be');
        const u8ar = new Uint8Array(str.length * 2);
        const view = new DataView(u8ar.buffer);
        for (let i = 0, I = str.length; i < I; i++) {
          const code = str.charCodeAt(i);
          view.setUint16(i * 2, code, littleEndian);
        }
        return u8ar;
      }

      const frame = document.createElement("iframe");
      frame.style.setProperty('display', 'none', 'important');
      {
        const js = browser.runtime.getURL('lib/unittest-encoding.js');
        const _str = escapeHtml(str);

        // run script in a document with specific charset to get the encoded text
        // hadnel different CSP rule for Chromium and Gecko
        if (utils.userAgent.is('chromium')) {
          frame.src = `data:text/html;charset=${encodeURIComponent(charset)},<script src="${js}" data-text="${encodeURIComponent(_str)}"></script>`;
        } else {
          const markup = `<script src="${js}" data-text="${_str}"></script>`;
          const blob = new Blob([markup], {type: `text/html;charset=${charset}`});
          frame.src = URL.createObjectURL(blob);
        }
      }
      document.body.append(frame);
      const aborter = new AbortController();
      let result = await new Promise((resolve) => {
        addEventListener("message", ({source, data}) => {
          if (source === frame.contentWindow) {
            aborter.abort();
            resolve(data);
          }
        }, {signal: aborter.signal});
      });
      frame.remove();
      try {
        result = unescapeHtml(result, replacement);
      } catch (code) {
        const _code = code.toString(16).toUpperCase();
        const idx = str.indexOf(String.fromCodePoint(code));
        throw new RangeError(`Unable to encode char U+${_code} at position ${idx}`);
      }
      return byteStringToU8Array(result);
    }

    return encodeText;
  })();

  function getRulesFromCssText(cssText) {
    const d = document.implementation.createHTMLDocument('');
    const styleElem = d.createElement('style');
    styleElem.textContent = cssText;
    d.head.appendChild(styleElem);
    return styleElem.sheet.cssRules;
  }

  var escapeRegExp = (() => {
    // Don't escape "-" as it causes an error for a RegExp with unicode flag.
    // Escaping "-" allows the result be embedded in a character class.
    // Escaping "/" allows the result be embedded in a JS regex literal.
    const regex = /[/\\^$*+?.|()[\]{}]/g;

    function escapeRegExp(str) {
      return str.replace(regex, "\\$&");
    }

    return escapeRegExp;
  })();

  /**
   * A RegExp with raw string.
   *
   * This is similar to /.../ but allows "/".
   *
   * Usage:
   *     regex`^text/html$` === /^text\/html$/
   */
  function regex(strings, ...args) {
    const results = [strings.raw[0]];
    args.forEach((arg, i) => {
      results.push(String(arg));
      results.push(strings.raw[i + 1]);
    });
    return new RegExp(results.join(''));
  }

  /**
   * A RegExp with literal string and optional interpolated RegExp source fragments.
   *
   * Usage:
   *     rawRegex`${'^'}(function () {${'.+'}})()${'$'}` === /^\(function \(\) \{.+\}\)\(\)$/
   */
  function rawRegex(strings, ...args) {
    const results = [escapeRegExp(strings.raw[0])];
    args.forEach((arg, i) => {
      if (arg instanceof RegExp) {
        results.push(arg.source);
      } else {
        results.push(String(arg));
      }
      results.push(escapeRegExp(strings.raw[i + 1]));
    });
    return new RegExp(results.join(''));
  }

  /**
   * A RegExp with raw CSS string with permissive spacing and optional
   * interpolated RegExp source fragments.
   *
   * Usage:
   *     cssRegex`body { background: ${/\w+/} }` === /body\s*\{\s*background:\s*\w+\s*\}/
   */
  function cssRegex(strings, ...args) {
    const ASCII_WHITESPACE = String.raw`\t\n\f\r `;
    const permissiveSpacing = (s) => s.split(regex`[${ASCII_WHITESPACE}]+`).map(s => escapeRegExp(s)).join(`[${ASCII_WHITESPACE}]*`);
    const results = [permissiveSpacing(strings.raw[0])];
    args.forEach((arg, i) => {
      if (arg instanceof RegExp) {
        results.push(arg.source);
      } else {
        results.push(String(arg));
      }
      results.push(permissiveSpacing(strings.raw[i + 1]));
    });
    return new RegExp(results.join(''));
  }

  return {
    assert,
    assertEqual,
    assertThrows,
    MochaQuery,
    sha1,
    getToken,
    getUuid,
    byteStringToArrayBuffer,
    encodeText,
    getRulesFromCssText,
    escapeRegExp,
    regex,
    rawRegex,
    cssRegex,
  };

}));
