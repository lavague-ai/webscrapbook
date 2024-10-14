(function (global, factory) {
  // Browser globals
  factory(
    global.isDebug,
    global.scrapbook,
  );
}(this, function (isDebug, scrapbook) {

  'use strict';

  chrome.runtime.onMessageExternal.addListener(
      async function(request, sender, sendResponse) {
        const options = scrapbook.getOptions();
        options["capture.saveFolder"] = request.folder || "webscrapbook/captures"
        options["capture.saveFilename"] = request.filename
        scrapbook.setOptions(options)
        const tabs = await scrapbook.getHighlightedTabs();
        const taskInfo = {
          tasks: tabs.map(tab => ({
            tabId: tab.id,
            url: tab.url,
            title: tab.title,
          })),
          mode: 'tab',
        };
        await scrapbook.invokeCaptureEx({taskInfo})
      }
  );
}))
