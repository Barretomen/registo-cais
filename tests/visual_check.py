import os
from pathlib import Path
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts"
OUT.mkdir(exist_ok=True)
WEB_URL = os.environ.get("WEB_URL", "http://127.0.0.1:4173")


def seed(context):
    context.add_init_script(
        """
        localStorage.setItem('registo_cais_guard_name_v1', 'Miguel Santos');
        localStorage.setItem('registo_cais_guard_number_v1', '24317');
        localStorage.setItem('registo_cais_theme_v1', 'light');
        localStorage.setItem('registo_cais_module_v1', 'estafetas');
        window.__DISABLE_CLOUD__ = true;
        """
    )


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    desktop = browser.new_context(viewport={"width": 1440, "height": 1000})
    seed(desktop)
    page = desktop.new_page()
    errors = []
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    page.goto(WEB_URL, wait_until="networkidle")

    assert page.locator("#guardOverlay").evaluate("el => el.classList.contains('hidden')")
    assert page.locator("#moduleTitle").inner_text() == "Registo de Estafetas"
    assert page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")

    page.locator("#courierName").fill("Ana Martins")
    page.locator("#destination").fill("Restaurante Norte — Piso 2")
    page.locator('[data-platform="Glovo"]').click()
    page.locator("#registerBtn").click()
    assert page.locator("#recordsList .record").count() == 1
    assert page.locator("#insideTabCount").inner_text() == "1"
    page.screenshot(path=str(OUT / "desktop-light.png"), full_page=True)

    page.locator('[data-tab="inside"]').click()
    page.locator("#insideList [data-exit]").click()
    assert page.locator("#insideHeroCount").inner_text() == "0"

    page.locator('[data-module="viaturas"]').click()
    assert page.locator("#vehicleForm").is_visible()
    assert page.locator("#moduleTitle").inner_text() == "Registo de Viaturas"
    page.locator('[data-module="pessoas"]').click()
    assert page.locator("#personForm").is_visible()
    assert page.locator("#moduleTitle").inner_text() == "Registo de Pessoas"

    page.locator("#themeToggle").click()
    assert page.locator("html").get_attribute("data-theme") == "dark"
    page.screenshot(path=str(OUT / "desktop-dark.png"), full_page=True)
    assert not errors, errors
    desktop.close()

    mobile = browser.new_context(viewport={"width": 390, "height": 844})
    seed(mobile)
    phone = mobile.new_page()
    phone_errors = []
    phone.on("pageerror", lambda exc: phone_errors.append(str(exc)))
    phone.goto(WEB_URL, wait_until="networkidle")
    assert phone.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")
    assert phone.locator("#courierForm").is_visible()
    phone.screenshot(path=str(OUT / "mobile-light.png"), full_page=True)
    assert not phone_errors, phone_errors
    mobile.close()
    browser.close()

print("visual and interaction checks passed")
