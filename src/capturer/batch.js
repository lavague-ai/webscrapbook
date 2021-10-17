/******************************************************************************
 *
 * Script for batch.html.
 *
 * @require {Object} scrapbook
 *****************************************************************************/

(function (root, factory) {
  // Browser globals
  root.batch = factory(
    root.isDebug,
    root.browser,
    root.scrapbook,
    window,
    console,
  );
}(this, function (isDebug, browser, scrapbook, window, console) {

  'use strict';

  async function init() {
    const missionId = new URL(document.URL).searchParams.get('mid');
    if (!missionId) { return; }

    const key = {table: "batchCaptureMissionCache", id: missionId};
    let data;
    try {
      data = await scrapbook.cache.get(key);
      await scrapbook.cache.remove(key);
      if (!data) { throw new Error(`Missing data for mission "${missionId}".`); }
    } catch (ex) {
      console.error(ex);
      return;
    }

    if (typeof data.ignoreTitle !== 'undefined') {
      document.getElementById('opt-ignoreTitle').checked = data.ignoreTitle;
    }
    if (typeof data.uniquify !== 'undefined') {
      document.getElementById('opt-uniquify').checked = data.uniquify;
    }
    if (typeof data.taskInfo !== 'undefined') {
      document.getElementById('urls').value = stringifyTasks(data.taskInfo);
    }
  }

  async function capture({taskInfo, ignoreTitle, uniquify}) {
    // remove duplicated URLs
    if (uniquify) {
      const urls = new Set();
      taskInfo.tasks = taskInfo.tasks.filter((task) => {
        if (task.url) {
          try {
            const normalizedUrl = scrapbook.normalizeUrl(task.url);
            if (urls.has(normalizedUrl)) {
              return false;
            }
            urls.add(normalizedUrl);
          } catch (ex) {
            throw Error(`Failed to uniquify invalid URL: ${task.url}`);
          }
        }
        return true;
      });
    }

    // remove title if ignoreTitle is set
    if (ignoreTitle) {
      for (const task of taskInfo.tasks) {
        delete(task.title);
      }
    }

    await scrapbook.invokeCaptureEx({taskInfo, waitForResponse: false});
  }

  function parseInputText(inputText) {
    const tasks = inputText
      .split('\n')
      .reduce((tasks, line) => {
        let [_, url, title] = line.match(/^(\S*)(?:\s+(.*))?$/mu);
        if (!url) { return tasks; }
        if (!title) { title = undefined; }
        if (url.startsWith('tab:')) {
          let [_, tabId, frameId] = url.split(':');
          tabId = parseInt(tabId, 10);
          if (!Number.isInteger(tabId)) { return tasks; }
          frameId = parseInt(frameId, 10);
          if (!Number.isInteger(frameId)) { frameId = undefined; }
          tasks.push({tabId, frameId, title});
        } else {
          tasks.push({url, title});
        }
        return tasks;
      }, []);
    return {tasks};
  }

  function stringifyTasks(taskInfo) {
    if (taskInfo) {
      return taskInfo.tasks
        .reduce((lines, task) => {
          let line;
          if (Number.isInteger(task.tabId)) {
            if (Number.isInteger(task.frameId)) {
              line = `tab:${task.tabId}:${task.frameId}`;
            } else {
              line = `tab:${task.tabId}`;
            }
          } else if (task.url) {
            line = task.url;
          } else {
            return lines;
          }
          if (task.title) {
            line += ' ' + task.title.replace(/[ \t\r\n\f]+/g, ' ').replace(/^ +/, '').replace(/ +$/, '');
          }
          lines.push(line);
          return lines;
        }, [])
        .join('\n');
    }
    return '';
  }

  function toggleTooltip(elem) {
    if (!toggleTooltip.tooltipMap) {
      toggleTooltip.tooltipMap = new WeakMap();
    }
    const tooltipMap = toggleTooltip.tooltipMap;

    let tooltip = tooltipMap.get(elem);
    if (tooltip) {
      tooltip.remove();
      tooltipMap.set(elem, null);
    } else {
      tooltip = elem.parentNode.insertBefore(document.createElement("div"), elem.nextSibling);
      tooltip.className = "tooltip";
      tooltip.textContent = elem.getAttribute("data-tooltip");
      tooltipMap.set(elem, tooltip);
    }
  }

  async function exit() {
    const tab = await browser.tabs.getCurrent();
    return await browser.tabs.remove(tab.id);
  };

  async function onCaptureClick(event) {
    const inputText = document.getElementById('urls').value;
    const ignoreTitle = document.getElementById('opt-ignoreTitle').checked;
    const uniquify = document.getElementById('opt-uniquify').checked;

    const taskInfo = parseInputText(inputText);
    await capture({taskInfo, ignoreTitle, uniquify});
    await exit();
  }

  async function onAbortClick(event) {
    await exit();
  }

  async function onAdvancedClick(event) {
    const inputText = document.getElementById('urls').value;
    const ignoreTitle = document.getElementById('opt-ignoreTitle').checked;
    const uniquify = document.getElementById('opt-uniquify').checked;

    const taskInfo = Object.assign({
      tasks: [],
      mode: "",
      bookId: (await scrapbook.cache.get({table: "scrapbookServer", key: "currentScrapbook"}, 'storage')) || "",
      parentId: "root",
      index: null,
      delay: null,
    }, parseInputText(inputText));
    await scrapbook.invokeBatchCapture({
      taskInfo,
      ignoreTitle,
      uniquify,
    }, 'advanced');
    await exit();
  }

  function onTooltipClick(event) {
    event.preventDefault();
    const elem = event.currentTarget;
    toggleTooltip(elem);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    scrapbook.loadLanguages(document);

    document.getElementById('btn-capture').addEventListener('click', onCaptureClick);
    document.getElementById('btn-abort').addEventListener('click', onAbortClick);
    document.getElementById('btn-advanced').addEventListener('click', onAdvancedClick);

    for (const elem of document.querySelectorAll('a[data-tooltip]')) {
      elem.addEventListener("click", onTooltipClick);
    }

    init();
  });

  return {
    capture,
  };

}));
