import os
from pathlib import Path
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
WEB_URL = os.environ.get("WEB_URL", "http://127.0.0.1:4177")


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1280, "height": 900})
    page = context.new_page()
    errors = []
    private_requests = []
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    page.on(
        "request",
        lambda request: private_requests.append(request.url)
        if "/rest/v1/movements" in request.url
        else None,
    )
    page.goto(WEB_URL, wait_until="networkidle")
    page.locator("#authOverlay").wait_for(state="visible")

    assert page.locator("#authTitle").inner_text() == "Entrar no Registo Cais"
    assert page.locator("#authEmail").get_attribute("autocomplete") == "username"
    assert page.locator("#authPassword").get_attribute("autocomplete") == "current-password"
    assert page.locator("#syncBadge").inner_text().strip() == "Sessão necessária"
    assert not private_requests, private_requests
    assert not errors, errors
    assert page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")
    browser.close()

print("cloud authentication gate checks passed")
