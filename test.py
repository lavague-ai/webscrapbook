from selenium import webdriver
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.action_chains import ActionChains

chrome_options = Options()

user_agent = "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36"
chrome_options.add_argument(f"user-agent={user_agent}")
chrome_options.add_argument("--no-sandbox")

# allow access to cross origin iframes
chrome_options.add_argument("--disable-web-security")
chrome_options.add_argument("--disable-site-isolation-trials")
chrome_options.add_argument("--disable-notifications")

chrome_options.add_extension("./dist/WebScrapbook.crx")

driver = webdriver.Chrome(options=chrome_options)

driver.get("https://huggingface.co")

script = """
extension_id = "gponkifbhfkdhgbgoiaoamaeclbbangg"

chrome.runtime.sendMessage(extension_id, {folder: "webscrapbook/captures", filename: "huggingface"},
    function(response) {
      if (!response.success)
        handleError(url);
    }
);
"""

driver.execute_script(script)

input()
