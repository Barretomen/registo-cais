import os
from pathlib import Path
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts"
OUT.mkdir(exist_ok=True)
WEB_URL = os.environ.get("WEB_URL", "http://127.0.0.1:4180")


SEED = """
window.__DISABLE_CLOUD__ = true;
localStorage.setItem('registo_cais_guard_name_v1', 'Miguel Santos');
localStorage.setItem('registo_cais_guard_number_v1', '24317');
"""

ROLE_AND_RECORDS = """
state.cloudEnabled = true;
state.cloudReady = true;
state.userRole = 'centralist';
state.profileName = 'Centralista';
state.courierRecords = [{id:'c1',entryDate:todayISO(),entryTime:'09:38',entryAt:`${todayISO()}T09:38:00`,exitDate:'',exitTime:'',exitAt:'',status:'inside',name:'Carlos',destination:'Burger King',platform:'Uber Eats',guardName:'Miguel Santos',guardNumber:'24317',createdAt:2,updatedAt:2}];
state.vehicleRecords = [{id:'v1',entryDate:todayISO(),entryTime:'09:42',entryAt:`${todayISO()}T09:42:00`,exitDate:'',exitTime:'',exitAt:'',status:'inside',plate:'AA-12-CB',persons:'Bruno',company:'DHL',destination:'Fnac — Piso 1',guardName:'Miguel Santos',guardNumber:'24317',createdAt:3,updatedAt:3}];
state.personRecords = [{id:'p1',entryDate:todayISO(),entryTime:'09:31',entryAt:`${todayISO()}T09:31:00`,exitDate:'',exitTime:'',exitAt:'',status:'inside',names:'Augusto',company:'Kone',destination:'Loja Meo — Piso 0',activity:'Manutenção',authorization:'pending',authorizationDate:'',authorizationTime:'',authorizationAt:'',guardName:'Miguel Santos',guardNumber:'24317',createdAt:1,updatedAt:1}];
document.body.dataset.cloudRole = 'centralist';
switchModule('estafetas');
"""


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    context.add_init_script(SEED)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    page.goto(WEB_URL, wait_until="networkidle")
    page.evaluate(ROLE_AND_RECORDS)

    assert page.locator("#centralMonitor").is_visible()
    assert page.locator("#moduleTitle").inner_text() == "Monitor da Central"
    assert page.locator("#monitorFeed .monitor-row").count() == 3
    assert "NULL" not in page.locator("#centralMonitor").inner_text()
    assert page.locator("#monitorInsideCount").inner_text() == "3"
    assert page.locator("#monitorPendingCount").inner_text() == "1"

    page.locator("#monitorKind").select_option("viaturas")
    assert page.locator("#monitorFeed .monitor-row").count() == 1
    assert "AA-12-CB" in page.locator("#monitorFeed").inner_text()
    page.locator("#monitorKind").select_option("all")
    page.locator("#monitorSearch").fill("kone")
    assert page.locator("#monitorFeed .monitor-row").count() == 1
    assert "Augusto" in page.locator("#monitorFeed").inner_text()
    page.locator("#monitorSearch").fill("")
    page.locator("#monitorState").select_option("pending")
    assert page.locator("#monitorFeed .monitor-row").count() == 1
    assert page.locator("#monitorFeed [data-authorize]").is_visible()
    page.locator("#monitorState").select_option("all")
    assert page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")
    page.screenshot(path=str(OUT / "central-monitor.png"), full_page=True)

    page.set_viewport_size({"width": 390, "height": 844})
    assert page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")
    assert page.locator("#monitorFeed .monitor-row").first.is_visible()
    assert not errors, errors
    browser.close()

print("central monitor checks passed")
