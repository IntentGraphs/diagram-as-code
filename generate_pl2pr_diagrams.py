from html import escape
from pathlib import Path
import re


OUT = Path(__file__).parent / "pl2pr_diagram_pack.drawio"


def esc(value: str) -> str:
    return escape(value, quote=True)


def cell(cid, value="", style="", vertex=False, parent="1", x=0, y=0, w=120, h=60,
         source=None, target=None, points=None):
    attrs = [f'id="{cid}"', f'value="{esc(value)}"', f'style="{esc(style)}"']
    if vertex:
        attrs += ['vertex="1"', f'parent="{parent}"']
        geom = f'<mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry" />'
        return f'<mxCell {" ".join(attrs)}>{geom}</mxCell>'
    attrs += ['edge="1"', f'parent="{parent}"']
    if source:
        attrs.append(f'source="{source}"')
    if target:
        attrs.append(f'target="{target}"')
    geom = '<mxGeometry relative="1" as="geometry" />'
    if points:
        pts = ''.join(f'<mxPoint x="{px}" y="{py}" />' for px, py in points)
        geom = f'<mxGeometry relative="1" as="geometry"><Array as="points">{pts}</Array></mxGeometry>'
    return f'<mxCell {" ".join(attrs)}>{geom}</mxCell>'


def v(cid, value, x, y, w, h, style, parent="1"):
    return cell(cid, value, style, True, parent, x, y, w, h)


def e(cid, source, target, value="", style=None, points=None):
    base = "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=block;"
    return cell(cid, value, style or base, False, "1", source=source, target=target, points=points)


def text(cid, value, x, y, w, h, font=12, color="#334155", align="left", bold=False):
    fs = "fontStyle=1;" if bold else ""
    return v(cid, value, x, y, w, h,
             f"rounded=0;whiteSpace=wrap;html=1;fillColor=none;strokeColor=none;fontColor={color};fontSize={font};{fs}align={align};verticalAlign=middle;")


def title(cid, value, subtitle=""):
    return text(cid, value + (f"&#xa;{subtitle}" if subtitle else ""), 30, 18, 2200, 55, 20, "#0f172a", "left", True)


def lane(cid, name, x, y, w, h, fill="#f8fafc", header="#e2e8f0", parent="1"):
    style = f"swimlane;startSize=34;html=1;whiteSpace=wrap;fillColor={fill};strokeColor=#94a3b8;fontColor=#0f172a;fontStyle=1;horizontal=0;"
    return v(cid, name, x, y, w, h, style, parent)


def task(cid, value, x, y, w=150, h=58, fill="#dbeafe", stroke="#2563eb", parent="1", marker="abstract"):
    style = ("points=[[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0.25,0],[1,0.5,0],[1,0.75,0],"
             "[0.75,1,0],[0.5,1,0],[0.25,1,0],[0,0.75,0],[0,0.5,0],[0,0.25,0]];"
             f"shape=mxgraph.bpmn.task2;whiteSpace=wrap;rectStyle=rounded;size=10;html=1;"
             f"container=1;expand=0;collapsible=0;taskMarker={marker};fillColor={fill};strokeColor={stroke};fontColor=#0f172a;fontSize=11;")
    return v(cid, value, x, y, w, h, style, parent)


def bpmn_event(cid, value, x, y, kind="start", parent="1"):
    if kind == "start":
        symbol = "none"; outline = "standard"
    elif kind == "end":
        symbol = "terminate2"; outline = "end"
    elif kind == "message":
        symbol = "message"; outline = "catching"
    else:
        symbol = "none"; outline = "standard"
    style = ("points=[[0.145,0.145,0],[0.5,0,0],[0.855,0.145,0],[1,0.5,0],[0.855,0.855,0],"
             f"[0.5,1,0],[0.145,0.855,0],[0,0.5,0]];shape=mxgraph.bpmn.event;html=1;"
             f"verticalLabelPosition=bottom;labelBackgroundColor=#ffffff;verticalAlign=top;"
             f"align=center;perimeter=ellipsePerimeter;outlineConnect=0;aspect=fixed;outline={outline};"
             f"symbol={symbol};fillColor=#ffffff;strokeColor=#0f172a;fontColor=#0f172a;fontSize=10;")
    return v(cid, value, x, y, 52, 52, style, parent)


def gateway(cid, value, x, y, parent="1"):
    style = ("points=[[0.25,0.25,0],[0.5,0,0],[0.75,0.25,0],[1,0.5,0],[0.75,0.75,0],"
             "[0.5,1,0],[0.25,0.75,0],[0,0.5,0]];shape=mxgraph.bpmn.gateway2;html=1;"
             "verticalLabelPosition=bottom;labelBackgroundColor=#ffffff;verticalAlign=top;"
             "align=center;perimeter=rhombusPerimeter;outlineConnect=0;outline=none;symbol=none;"
             "gwType=exclusive;fillColor=#fef3c7;strokeColor=#d97706;fontColor=#0f172a;fontSize=10;")
    return v(cid, value, x, y, 54, 54, style, parent)


def data(cid, value, x, y, w=150, h=52, fill="#ffedd5", stroke="#ea580c", parent="1"):
    return v(cid, value, x, y, w, h,
             f"shape=parallelogram;perimeter=parallelogramPerimeter;whiteSpace=wrap;html=1;fillColor={fill};strokeColor={stroke};fontColor=#0f172a;fontSize=11;", parent)


def db(cid, value, x, y, w=150, h=64, parent="1"):
    return v(cid, value, x, y, w, h,
             "shape=cylinder3;whiteSpace=wrap;html=1;fillColor=#dcfce7;strokeColor=#16a34a;fontColor=#0f172a;fontSize=11;", parent)


def arch_box(cid, value, x, y, w, h, fill="#dbeafe", stroke="#2563eb", parent="1", dashed=False):
    dash = "dashed=1;" if dashed else ""
    return v(cid, value, x, y, w, h,
             f"rounded=1;whiteSpace=wrap;html=1;fillColor={fill};strokeColor={stroke};fontColor=#0f172a;fontSize=11;{dash}", parent)


def note(cid, value, x, y, w, h, fill="#fff7ed", stroke="#f97316"):
    return v(cid, value, x, y, w, h,
             f"shape=note;whiteSpace=wrap;html=1;fillColor={fill};strokeColor={stroke};fontColor=#7c2d12;fontSize=10;")


def legend(cells, x=30, y=1190):
    cells.append(text("legend-title", "Legend / modeling notes", x, y, 190, 24, 12, "#0f172a", "left", True))
    cells.append(arch_box("legend-bpmn", "BPMN task / event / gateway", x + 205, y, 190, 32, "#dbeafe", "#2563eb"))
    cells.append(arch_box("legend-data", "Data object / interface", x + 410, y, 180, 32, "#ffedd5", "#ea580c"))
    cells.append(note("legend-open", "Orange dashed notes = source open point / validation item", x + 605, y, 330, 40))


def page(name, cells, width=2400, height=1300):
    root = ['<mxCell id="0" />', '<mxCell id="1" parent="0" />'] + cells
    body = (f'<diagram id="{esc(name.lower().replace(" ", "-"))}" name="{esc(name)}">'
            f'<mxGraphModel dx="1600" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="{width}" pageHeight="{height}" math="0" shadow="0">'
            f'<root>{"".join(root)}</root></mxGraphModel></diagram>')
    # Keep cell IDs unique across the whole multi-page file for deterministic linting.
    prefix = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") + "-"
    ids = set(re.findall(r'id="([^"]+)"', body)) - {"0", "1"}
    mapping = {cid: prefix + cid for cid in ids}

    def repl(match):
        attr, value = match.group(1), match.group(2)
        if value in {"0", "1"}:
            return match.group(0)
        return f'{attr}="{esc(mapping.get(value, value))}"'

    return re.sub(r'(id|source|target|parent)="([^"]+)"', repl, body)


def page1_bpmn_e2e():
    c = [title("t", "BPMN 01 — Plan-to-Produce end-to-end", "Consolidated from PL2PR-01, PL2PR-02, PL2PR-03 • sequence flow is left-to-right; dashed edges indicate system/message exchange")]
    lanes = [
        ("l1", "Customer / Clinic / Sales", 30, 100, 2340, 145, "#f8fafc"),
        ("l2", "Orchestration + Capacity / APS", 30, 245, 2340, 145, "#eef2ff"),
        ("l3", "S/4HANA / SAP PP-PI / MRP", 30, 390, 2340, 235, "#eff6ff"),
        ("l4", "MES / EWM / LIMS execution", 30, 625, 2340, 225, "#f0fdf4"),
        ("l5", "Upstream + Downstream manufacturing", 30, 850, 2340, 225, "#fff7ed"),
    ]
    c += [lane(*x) for x in lanes]
    c += [
        bpmn_event("s1", "Demand received", 60, 145, "start"),
        data("d1", "Patient ID + confirmation date", 130, 140, 165, 62),
        task("p1", "Create / maintain sales order", 340, 136, 175, 62, "#dbeafe", "#2563eb"),
        task("p2", "Share demand + biological information", 560, 276, 185, 62, "#e0e7ff", "#4f46e5"),
        task("p3", "Sequence upstream + downstream chain", 790, 276, 185, 62, "#e0e7ff", "#4f46e5"),
        task("p4", "Finite capacity / APS scheduling", 1020, 276, 185, 62, "#e0e7ff", "#4f46e5"),
        gateway("g1", "Schedule\nacceptable?", 1250, 280),
        task("p5", "Revisit schedule / confirmation date", 1020, 182, 185, 62, "#ffedd5", "#ea580c"),
        task("p6", "Run MRP / pMRP and create order network", 1335, 440, 205, 62, "#dbeafe", "#2563eb"),
        task("p7", "Create / convert planned orders to process orders", 1585, 440, 215, 62, "#dbeafe", "#2563eb"),
        task("p8", "Assign Patient ID / project ID; send order to MES", 1845, 440, 205, 62, "#dbeafe", "#2563eb"),
        task("p9", "Process order cockpit: batches, chain, schedule", 2070, 440, 210, 62, "#dbeafe", "#2563eb"),
        task("p10", "Receive order; create shop-floor order from MBR", 350, 676, 220, 62, "#dcfce7", "#16a34a"),
        task("p11", "Stage / pick / kit materials", 610, 676, 175, 62, "#dcfce7", "#16a34a"),
        task("p12", "Execute operations; capture EBR, times, confirmations", 825, 676, 230, 62, "#dcfce7", "#16a34a"),
        task("p13", "Post GI / GR / inventory handover", 1095, 676, 185, 62, "#dcfce7", "#16a34a"),
        task("p14", "Inspect lots; release batch / CoA / retention sample", 1320, 676, 225, 62, "#dcfce7", "#16a34a"),
        task("p15", "Produce plasmids A/B and upstream inputs", 550, 901, 205, 62, "#ffedd5", "#ea580c"),
        task("p16", "DTM → RMG → LPX → F&F", 810, 901, 190, 62, "#ffedd5", "#ea580c"),
        task("p17", "VuLuP: visual → label → pack → freeze", 1050, 901, 220, 62, "#ffedd5", "#ea580c"),
        task("p18", "Batch release + SAP delivery to clinic / hospital", 1330, 901, 235, 62, "#ffedd5", "#ea580c"),
        bpmn_event("e1", "Delivered", 1650, 906, "end"),
        e("e01", "s1", "p1"), e("e02", "p1", "p2", "", "dashed=1;endArrow=open;html=1;"),
        e("e03", "p2", "p3"), e("e04", "p3", "p4"), e("e05", "p4", "g1"),
        e("e06", "g1", "p5", "No", None, [(1275, 258), (1110, 214)]), e("e07", "p5", "p4", "Re-plan", None, [(1110, 246), (1110, 290)]),
        e("e08", "g1", "p6", "Yes", None, [(1305, 307), (1370, 470)]), e("e09", "p6", "p7"), e("e10", "p7", "p8"), e("e11", "p8", "p9"),
        e("e12", "p9", "p10", "Process order / MBR", "dashed=1;endArrow=open;html=1;"),
        e("e13", "p10", "p11"), e("e14", "p11", "p12"), e("e15", "p12", "p13"), e("e16", "p13", "p14"),
        e("e17", "p14", "p15", "Upstream / downstream release", "dashed=1;endArrow=open;html=1;", [(1435, 738), (650, 930)]),
        e("e18", "p15", "p16"), e("e19", "p16", "p17"), e("e20", "p17", "p18"), e("e21", "p18", "e1"),
        note("n1", "Open points from source: finite scheduling tool is not decided; orchestration integration and upstream ownership are GAPs to validate.", 1760, 185, 500, 88),
        note("n2", "Traceability anchor: sales order is 1:1 with Patient ID; confirmation date and end date incl. QC travel through the chain.", 1760, 695, 500, 90),
    ]
    legend(c, 30, 1120)
    return page("01 BPMN End-to-End", c, 2400, 1250)


def page2_bpmn_planning():
    c = [title("t", "BPMN 02 — Demand, MTO/MTS, MRP and capacity planning", "Shows the planning hierarchy, strategy decision, MRP proposals, APS balancing and planned-order conversion")]
    c += [lane("a", "Demand / Sales / Orchestration", 30, 100, 2340, 150, "#f8fafc"),
          lane("b", "APS / RCCP / Resource capacity", 30, 250, 2340, 150, "#eef2ff"),
          lane("c", "S/4 MRP / pMRP / PP-PI", 30, 400, 2340, 250, "#eff6ff"),
          lane("d", "Procurement / Transfer / MRP areas", 30, 650, 2340, 160, "#f0fdf4"),
          lane("f", "Process-order cockpit / execution handoff", 30, 810, 2340, 150, "#fff7ed")]
    c += [
        bpmn_event("s", "Forecast / sales order", 60, 150, "start"),
        data("demand-data", "Patient ID + confirmation date", 125, 146, 175, 58),
        task("t1", "Capture demand / independent requirements", 345, 142, 200, 64, "#dbeafe", "#2563eb"),
        gateway("g", "MTO / MTS /\nATO?", 595, 147),
        task("mto", "MTO: customer requirement KEV; consume against sales order", 690, 105, 240, 66, "#e0e7ff", "#4f46e5"),
        task("mts", "MTS: PIR / VSE; plan stock and component replenishment", 690, 195, 240, 66, "#e0e7ff", "#4f46e5"),
        task("ato", "ATO: check component availability at order entry", 970, 105, 230, 66, "#e0e7ff", "#4f46e5"),
        task("t2", "S&OP → RCCP → DM → MPS horizon alignment", 970, 195, 230, 66, "#e0e7ff", "#4f46e5"),
        task("t3", "Run APS / resource capacity simulation", 1240, 292, 220, 66, "#e0e7ff", "#4f46e5"),
        gateway("g2", "Capacity /\ndate feasible?", 1510, 297),
        task("t4", "Exception messages / reschedule / revise quantity", 1240, 410, 225, 66, "#ffedd5", "#ea580c"),
        task("t5", "Run operational MRP: NETCH / NETPL / NEUPL", 1620, 442, 230, 66, "#dbeafe", "#2563eb"),
        task("t6", "BOM explosion + dependent requirements + pegging", 1895, 442, 230, 66, "#dbeafe", "#2563eb"),
        task("t7", "pMRP simulation: restricted scope, deterministic / lot-for-lot", 1620, 342, 245, 66, "#ede9fe", "#7c3aed", marker="businessRule"),
        gateway("g3", "Proposal type?", 1620, 570),
        task("t8", "Planned orders / PRs / schedule lines / stock transfers", 1710, 675, 260, 64, "#dcfce7", "#16a34a"),
        task("t9", "Check MRP area, lot size and procurement type", 2000, 675, 235, 64, "#dcfce7", "#16a34a"),
        task("t10", "Mass / collective conversion to fixed receipt elements", 1740, 835, 250, 64, "#ffedd5", "#ea580c"),
        task("t11", "Create process-order chain; preserve Patient ID and date", 2020, 835, 250, 64, "#ffedd5", "#ea580c"),
        bpmn_event("end", "Released plan", 2275, 841, "end"),
        e("p01", "s", "t1"), e("p02", "t1", "g"), e("p03", "g", "mto", "MTO", None, [(622, 170), (710, 140)]), e("p04", "g", "mts", "MTS", None, [(622, 180), (710, 225)]),
        e("p05", "mto", "ato", "ATO / component check", None, [(930, 140), (1000, 140)]), e("p06", "mts", "t2", "MTS", None, [(930, 230), (1000, 230)]),
        e("p07", "ato", "t3"), e("p08", "t2", "t3"), e("p09", "t3", "g2"), e("p10", "g2", "t4", "No", None, [(1535, 330), (1350, 430)]), e("p11", "t4", "t3", "Re-plan", None, [(1335, 410), (1335, 325)]),
        e("p12", "g2", "t5", "Yes", None, [(1560, 325), (1650, 470)]), e("p13", "t3", "t7", "Simulation", "dashed=1;endArrow=open;html=1;"), e("p14", "t5", "t6"), e("p15", "t6", "g3"),
        e("p16", "g3", "t8", "Procure / transfer", None, [(1650, 600), (1780, 695)]), e("p17", "g3", "t10", "In-house process", None, [(1660, 600), (1840, 855)]), e("p18", "t8", "t9"), e("p19", "t9", "t10", "Fixed receipt elements", "dashed=1;endArrow=open;html=1;"), e("p20", "t10", "t11"), e("p21", "t11", "end"),
        note("pn1", "Planning horizons in source: annual operations plan / strategic planning → S&OP up to 18 months → RCCP/DM up to 6 months → MPS/MRP up to 4 weeks → CRP/SFC up to 1 week.", 60, 1000, 760, 70),
        note("pn2", "Open point: MTO/MTS class, requirements type, item category group and batch-numbering convention require business validation.", 850, 1000, 650, 70),
        note("pn3", "Open point: APS / finite scheduling product is not decided; integration is required if scheduling is external to SAP.", 1550, 1000, 720, 70),
    ]
    legend(c, 30, 1120)
    return page("02 BPMN Planning and MRP", c, 2400, 1250)


def page3_bpmn_execution():
    c = [title("t", "BPMN 03 — Process-order execution, kitting, batch and QC control", "Execution path derived from PL2PR-03; rules shown as business-rule tasks and decisions")]
    c += [lane("s4", "S/4HANA / PP-PI", 30, 100, 2340, 190, "#eff6ff"),
          lane("ewm", "EWM / warehouse / flow rack", 30, 290, 2340, 170, "#f0fdf4"),
          lane("mes", "MES / PAS-X", 30, 460, 2340, 190, "#ecfdf5"),
          lane("qc", "LIMS / QC / batch release", 30, 650, 2340, 180, "#fefce8"),
          lane("mfg", "Upstream + downstream manufacturing", 30, 830, 2340, 185, "#fff7ed")]
    c += [
        bpmn_event("s", "Process order released", 60, 168, "start"),
        task("a1", "Determine first batch per component (FEFO)", 145, 163, 225, 64, "#dbeafe", "#2563eb", marker="businessRule"),
        task("a2", "Read each component SLED / QA status", 405, 163, 210, 64, "#dbeafe", "#2563eb", marker="businessRule"),
        task("a3", "ATP / availability check", 650, 163, 180, 64, "#dbeafe", "#2563eb", marker="businessRule"),
        gateway("g1", "Enough qty +\ncompliant SLED?", 875, 168),
        task("a4", "Reverse-engineer kit quantity from component stock", 970, 105, 250, 64, "#ffedd5", "#ea580c", marker="businessRule"),
        task("a5", "Reduce header quantity; create complementary order", 1260, 105, 235, 64, "#ffedd5", "#ea580c"),
        task("a6", "Propagate minimum SLED to kit header; no batch split", 970, 205, 255, 64, "#dbeafe", "#2563eb", marker="businessRule"),
        task("a7", "Create header batch on release / assign co-product batch", 1260, 205, 235, 64, "#dbeafe", "#2563eb"),
        task("b1", "Stage / pick from flow rack and production supply area", 1530, 330, 250, 64, "#dcfce7", "#16a34a"),
        task("b2", "Scan material; clean / wipe kit box; e-sign", 1820, 330, 220, 64, "#dcfce7", "#16a34a"),
        task("b3", "Handover transport to production", 2080, 330, 200, 64, "#dcfce7", "#16a34a"),
        task("c1", "Receive process order; validate PV against MBR", 1540, 500, 240, 64, "#dcfce7", "#16a34a"),
        task("c2", "Create / release shop-floor orders; execute operations", 1820, 500, 240, 64, "#dcfce7", "#16a34a"),
        task("c3", "Capture operational times, EBR and confirmations", 2090, 500, 190, 64, "#dcfce7", "#16a34a"),
        task("d1", "LIMS inspection lot / analytical sample / results", 1540, 690, 250, 64, "#fef3c7", "#ca8a04"),
        gateway("g2", "QC / BRR\napproved?", 1830, 695),
        task("d2", "Hold / rework / scrap / resample", 1930, 635, 210, 64, "#fee2e2", "#dc2626"),
        task("d3", "Batch release, CoA, retention sample, release register", 1930, 735, 250, 64, "#fef3c7", "#ca8a04"),
        task("m1", "DTM / RMG / LPX / F&F", 1570, 870, 220, 64, "#ffedd5", "#ea580c"),
        task("m2", "VuLuP visual / label / packaging / freezing", 1830, 870, 245, 64, "#ffedd5", "#ea580c"),
        task("m3", "Post GR / GI; settle; TECO via daily job after GR", 2110, 870, 170, 64, "#ffedd5", "#ea580c"),
        bpmn_event("end", "Released / delivered", 2290, 875, "end"),
        e("x01", "s", "a1"), e("x02", "a1", "a2"), e("x03", "a2", "a3"), e("x04", "a3", "g1"),
        e("x05", "g1", "a4", "No", None, [(902, 190), (1020, 140)]), e("x06", "a4", "a5"), e("x07", "a5", "a1", "Complementary order / loop", None, [(1370, 100), (240, 190)]),
        e("x08", "g1", "a6", "Yes", None, [(902, 205), (1020, 238)]), e("x09", "a6", "a7"), e("x10", "a7", "b1", "Release / staging", "dashed=1;endArrow=open;html=1;"), e("x11", "b1", "b2"), e("x12", "b2", "b3"),
        e("x13", "b3", "c1", "Transport / inventory", "dashed=1;endArrow=open;html=1;"), e("x14", "c1", "c2"), e("x15", "c2", "c3"), e("x16", "c3", "d1", "Results / samples", "dashed=1;endArrow=open;html=1;"), e("x17", "d1", "g2"),
        e("x18", "g2", "d2", "No", None, [(1855, 670), (2010, 660)]), e("x19", "d2", "c2", "Rework / repeat", None, [(2010, 635), (1940, 530)]), e("x20", "g2", "d3", "Yes", None, [(1860, 720), (1990, 760)]), e("x21", "d3", "m1", "Release to downstream", "dashed=1;endArrow=open;html=1;"), e("x22", "m1", "m2"), e("x23", "m2", "m3"), e("x24", "m3", "end"),
        note("en1", "Source rules: use unrestricted / QC-compliant batches; no component batch split; component SLED must retain at least 75% of lifespan; header inherits minimum SLED.", 60, 1060, 730, 78),
        note("en2", "Source open point: confirm whether staging applies to plasmid only or all materials; validate EWM / MM-IM ownership and interface frequency.", 820, 1060, 700, 78),
        note("en3", "Source interface IDs: 491 process order outbound; 492 start/end MO; 493 operational times; 494/495 stock creation/take-out cancellation; 483/484 batch/BRR inbound.", 1550, 1060, 730, 78),
    ]
    legend(c, 30, 1180)
    return page("03 BPMN Execution and Kitting", c, 2400, 1300)


def arch_layer(cid, value, x, y, w, h, fill, stroke):
    return v(cid, value, x, y, w, h, f"swimlane;startSize=32;html=1;fillColor={fill};strokeColor={stroke};fontColor=#0f172a;fontStyle=1;horizontal=0;container=1;pointerEvents=0;")


def page4_arch_logical():
    c = [title("t", "ARCH 01 — Logical system architecture", "Layers show ownership and primary data responsibility; detailed interface IDs are on ARCH 02")]
    c += [
        arch_layer("ext", "External / business actors", 30, 105, 2340, 125, "#f8fafc", "#94a3b8"),
        arch_layer("plan", "Planning, orchestration and scheduling", 30, 230, 2340, 160, "#eef2ff", "#818cf8"),
        arch_layer("erp", "Core ERP / planning / order management", 30, 390, 2340, 225, "#eff6ff", "#60a5fa"),
        arch_layer("exec", "Execution, warehouse and quality", 30, 615, 2340, 210, "#f0fdf4", "#4ade80"),
        arch_layer("mfg", "Manufacturing / product flow", 30, 825, 2340, 160, "#fff7ed", "#fb923c"),
        arch_layer("data", "Master / transactional / organizational data", 30, 985, 2340, 145, "#fefce8", "#facc15"),
    ]
    c += [
        arch_box("clinic", "Clinic / hospital\npatient demand", 95, 145, 230, 60, "#f1f5f9", "#64748b", "ext"),
        arch_box("sales", "Sales / customer service", 390, 145, 230, 60, "#f1f5f9", "#64748b", "ext"),
        arch_box("upstream", "Upstream partner / BioNTech\nplasmid A + B / genetic info", 710, 135, 260, 80, "#f1f5f9", "#64748b", "ext", True),
        arch_box("cmo", "CMO / external manufacturing", 1060, 145, 240, 60, "#f1f5f9", "#64748b", "ext", True),
        arch_box("orches", "Orchestration Tool / IPOT\nPatient ID • biological info • dates", 160, 270, 300, 80, "#e0e7ff", "#4f46e5", "plan"),
        arch_box("aps", "Capacity / APS / finite scheduling\nresources • pegging • confirmation date", 565, 270, 300, 80, "#e0e7ff", "#4f46e5", "plan"),
        arch_box("s4", "S/4HANA / SAP PP-PI\nSales order • MRP/pMRP • process orders", 110, 435, 330, 90, "#dbeafe", "#2563eb", "erp"),
        arch_box("cockpit", "Process Order Cockpit\nchain • batches • schedule", 505, 435, 260, 90, "#dbeafe", "#2563eb", "erp"),
        arch_box("order", "Order Network 4711\n4711-1 … 4711-11", 820, 435, 245, 90, "#dbeafe", "#2563eb", "erp"),
        db("batchdb", "Batch / SLED / classification\nGR • GI • co-product", 1120, 435, 210, 90, "erp"),
        arch_box("cost", "Controlling / costing\nWIP • settlement • variances", 1390, 435, 250, 90, "#dbeafe", "#2563eb", "erp"),
        arch_box("delivery", "Delivery / customer fulfillment", 1700, 435, 250, 90, "#dbeafe", "#2563eb", "erp"),
        arch_box("pasx", "MES / PAS-X\nMBR • SFO/MO • EBR • confirmations", 110, 665, 315, 90, "#dcfce7", "#16a34a", "exec"),
        arch_box("ewm", "SAP EWM / MM-IM\nflow rack • staging • transport • inventory", 500, 665, 315, 90, "#dcfce7", "#16a34a", "exec"),
        arch_box("lims", "LIMS / QC\ninspection lots • analytics • BRR", 900, 665, 270, 90, "#fef3c7", "#ca8a04", "exec"),
        arch_box("label", "Nicelabel / print services\nlabels except MES GR/HU labels", 1250, 665, 275, 90, "#dcfce7", "#16a34a", "exec"),
        arch_box("trace", "Audit trail / e-signature", 1600, 665, 240, 90, "#dcfce7", "#16a34a", "exec"),
        arch_box("product", "Upstream → downstream chain\nDTM → RMG → LPX → F&F → VuLuP", 270, 875, 430, 70, "#ffedd5", "#ea580c", "mfg"),
        arch_box("freezer", "Final product / VULUP pack freezer", 850, 875, 300, 70, "#ffedd5", "#ea580c", "mfg"),
        arch_box("clinicout", "SAP Delivery → clinic / hospital", 1320, 875, 320, 70, "#ffedd5", "#ea580c", "mfg"),
        db("master", "Master data: material • BOM • recipe\nproduction version • resources", 180, 1025, 320, 75, "data"),
        db("org", "Organizational data\nplant • storage • MRP areas", 640, 1025, 280, 75, "data"),
        db("trans", "Transactional data\norders • movements • confirmations", 1060, 1025, 330, 75, "data"),
        db("quality", "Quality / batch characteristics\nresults • release status", 1530, 1025, 330, 75, "data"),
        e("a01", "clinic", "sales", "demand", "dashed=1;endArrow=open;html=1;"), e("a02", "sales", "orches", "Patient ID / order", "dashed=1;endArrow=open;html=1;"), e("a03", "upstream", "orches", "genetic / biological info", "dashed=1;endArrow=open;html=1;"),
        e("a04", "orches", "s4", "sales order context", "dashed=1;endArrow=open;html=1;"), e("a05", "orches", "aps", "demand / chain", "dashed=1;endArrow=open;html=1;"), e("a06", "aps", "s4", "scheduled dates / capacity", "dashed=1;endArrow=open;html=1;"),
        e("a07", "s4", "cockpit", "orders", None), e("a08", "cockpit", "order", "4711 chain", None), e("a09", "order", "batchdb", "batch genealogy", None), e("a10", "s4", "delivery", "delivery", None),
        e("a11", "cockpit", "pasx", "process order / MBR", "dashed=1;endArrow=open;html=1;"), e("a12", "pasx", "ewm", "stage / transport", "dashed=1;endArrow=open;html=1;"), e("a13", "pasx", "lims", "inspection / results", "dashed=1;endArrow=open;html=1;"), e("a14", "pasx", "label", "print data", "dashed=1;endArrow=open;html=1;"), e("a15", "pasx", "trace", "EBR / e-sign", "dashed=1;endArrow=open;html=1;"),
        e("a16", "ewm", "product", "material handover", None), e("a17", "product", "freezer", "batch flow", None), e("a18", "freezer", "clinicout", "released product", None), e("a19", "clinicout", "delivery", "delivery reference", "dashed=1;endArrow=open;html=1;"),
        e("a20", "master", "s4", "master data", "dashed=1;endArrow=open;html=1;"), e("a21", "org", "s4", "org structure", "dashed=1;endArrow=open;html=1;"), e("a22", "trans", "s4", "transactions", "dashed=1;endArrow=open;html=1;"), e("a23", "quality", "lims", "quality attributes", "dashed=1;endArrow=open;html=1;"),
        note("an1", "Open points: APS product / finite scheduling tool, upstream integration ownership, CMO solution, and exact staging scope are not finalized in the sources.", 1900, 1020, 410, 86),
    ]
    return page("04 Architecture Logical", c, 2400, 1250)


def page5_arch_integration():
    c = [title("t", "ARCH 02 — Integration and interface architecture", "Source interface IDs are preserved so this page can become the basis for an integration catalogue / test matrix")]
    c += [
        arch_layer("left", "S/4HANA / SAP PP-PI", 30, 110, 650, 890, "#eff6ff", "#60a5fa"),
        arch_layer("hub", "S/4 × PAS-X interface boundary", 750, 110, 900, 890, "#f8fafc", "#94a3b8"),
        arch_layer("right", "MES / PAS-X / EWM / LIMS", 1720, 110, 650, 890, "#f0fdf4", "#4ade80"),
        arch_box("s4m", "Material / equipment / batch / MBR master", 100, 190, 470, 70, "#dbeafe", "#2563eb", "left"),
        arch_box("s4p", "Process order + patient ID / confirmation date", 100, 300, 470, 70, "#dbeafe", "#2563eb", "left"),
        arch_box("s4i", "Inventory / transport / GR / GI / confirmations", 100, 410, 470, 70, "#dbeafe", "#2563eb", "left"),
        arch_box("s4q", "Batch release / quality / delivery / controlling", 100, 520, 470, 70, "#dbeafe", "#2563eb", "left"),
        arch_box("ifout", "Outbound messages\n478 Material Master\n479 GHS Data\n480 MBR (BOM & Routing)\n481 Equipment Master / Status\n482 Batch Data\n485 Incoming Transport\n490 Inventory Refresh\n491 Process Order", 830, 190, 330, 250, "#dbeafe", "#2563eb", "hub"),
        arch_box("ifin", "Inbound messages\n483 Batch Data from PAS-X\n484 BRR Approval\n486 Transport Order\n487 Handover to ERP\n488 Permanent Inventory\n489 Cost center / scrap / sampling\n492 Start/End MO\n493 Operational Times\n494 Cancel stock creation\n495 Cancel take-out", 1240, 190, 330, 300, "#dcfce7", "#16a34a", "hub"),
        arch_box("pasxm", "PAS-X MES\nMBR / MO / SFO / EBR", 1800, 190, 440, 85, "#dcfce7", "#16a34a", "right"),
        arch_box("ewmr", "EWM / warehouse\ntransport • staging • inventory", 1800, 330, 440, 85, "#dcfce7", "#16a34a", "right"),
        arch_box("limsr", "LIMS / QC\ninspection lot • analytics • BRR", 1800, 470, 440, 85, "#fef3c7", "#ca8a04", "right"),
        arch_box("labelr", "Nicelabel / label service", 1800, 610, 440, 70, "#dcfce7", "#16a34a", "right"),
        arch_box("orchr", "Orchestration / APS\nPatient ID • confirmation date • end date incl. QC", 1800, 745, 440, 100, "#e0e7ff", "#4f46e5", "right"),
        arch_box("upstr", "Upstream / plasmid A + B", 1800, 900, 210, 60, "#ffedd5", "#ea580c", "right", True),
        arch_box("downstr", "Downstream product chain", 2030, 900, 210, 60, "#ffedd5", "#ea580c", "right"),
        e("i01", "s4m", "ifout", "478 / 479 / 480 / 481 / 482", "endArrow=block;html=1;"), e("i02", "s4p", "ifout", "491", "endArrow=block;html=1;"), e("i03", "s4i", "ifout", "485 / 490", "endArrow=block;html=1;"), e("i04", "ifout", "pasxm", "outbound", "endArrow=block;html=1;"),
        e("i05", "pasxm", "ifin", "483 / 484 / 492 / 493 / 494 / 495", "endArrow=block;html=1;"), e("i06", "ewmr", "ifin", "486 / 487 / 488 / 489", "endArrow=block;html=1;"), e("i07", "ifin", "s4i", "inbound movements / confirmations", "endArrow=block;html=1;"), e("i08", "ifin", "s4q", "BRR / quality / status", "endArrow=block;html=1;"),
        e("i09", "orchr", "s4p", "patient ID / confirmation date", "dashed=1;endArrow=open;html=1;"), e("i10", "s4p", "orchr", "scheduled order network / end date", "dashed=1;endArrow=open;html=1;"), e("i11", "upstr", "s4m", "plasmid / biological data", "dashed=1;endArrow=open;html=1;"), e("i12", "s4q", "downstr", "delivery / released product", "dashed=1;endArrow=open;html=1;"),
        note("in1", "Integration design intent: standard S/4 ↔ PAS-X paths cover most execution; custom GAPs include cockpit functions, batch/co-product handling, patient/project identification and upstream integration.", 810, 560, 760, 120),
        note("in2", "Open points: interface frequency, exception handling, staging scope, CMO solution, and exact external scheduling product require design decisions.", 810, 720, 760, 95),
    ]
    return page("05 Architecture Integration", c, 2400, 1150)


def page6_arch_traceability():
    c = [title("t", "ARCH 03 — 4711 order-network and batch genealogy", "Traceability view: patient / plasmid identity travels across the two-leg chain and converges at the final pack freezer")]
    c += [
        arch_layer("id", "Identity and commercial anchor", 30, 105, 2340, 130, "#f8fafc", "#94a3b8"),
        arch_layer("a", "Template A leg", 30, 235, 1120, 650, "#eff6ff", "#60a5fa"),
        arch_layer("b", "Template B leg", 1250, 235, 1120, 650, "#eef2ff", "#818cf8"),
        arch_layer("out", "Convergence / release", 30, 885, 2340, 190, "#fff7ed", "#fb923c"),
        arch_box("so", "SAP Sales Order\nPatient ID + confirmation date\n1:1 identity anchor", 100, 145, 300, 70, "#dbeafe", "#2563eb", "id"),
        arch_box("plasmida", "Plasmid A\nupstream GR / batch", 550, 145, 260, 70, "#ffedd5", "#ea580c", "id", True),
        arch_box("plasmidb", "Plasmid B\nupstream GR / batch", 900, 145, 260, 70, "#ffedd5", "#ea580c", "id", True),
        arch_box("a0", "4711A / 4711-0\nPlasmid A input", 100, 320, 250, 60, "#ffedd5", "#ea580c", "a"),
        arch_box("a1", "4711-6\nDTM — DNA template manufacturing\nGR 4711-6 / GI plasmid A", 430, 315, 300, 70, "#dbeafe", "#2563eb", "a"),
        arch_box("a2", "4711-5\nRMG — RNA manufacturing\nGR 4711-5 / GI 4711-6", 810, 315, 260, 70, "#dbeafe", "#2563eb", "a"),
        arch_box("b0", "4711B / 4711-0\nPlasmid B input", 100, 515, 250, 60, "#ffedd5", "#ea580c", "b"),
        arch_box("b1", "4711-7\nDTM — second template leg\nGR 4711-7 / GI plasmid B", 430, 510, 300, 70, "#e0e7ff", "#4f46e5", "b"),
        arch_box("b2", "4711-8 / 4711-9\nLPX / encapsulation legs\nGR/GI linked by batch", 810, 510, 260, 70, "#e0e7ff", "#4f46e5", "b"),
        arch_box("a3", "4711-4\nLPX / F&F handoff\nGI to next order", 430, 650, 300, 70, "#dbeafe", "#2563eb", "a"),
        arch_box("a4", "4711-3\nVuLuP visual / label\nGR 4711-3 / GI 4711-4", 810, 650, 260, 70, "#dbeafe", "#2563eb", "a"),
        arch_box("b3", "4711-10\nF&F / VuLuP downstream leg\nGR 4711-10 / GI 4711-9", 430, 760, 300, 70, "#e0e7ff", "#4f46e5", "b"),
        arch_box("b4", "4711-11\nFinal VuLuP output leg\nGR 4711-11 / GI 4711-10", 810, 760, 260, 70, "#e0e7ff", "#4f46e5", "b"),
        arch_box("merge", "4711-1\nVuLuP pack freezer / final product\nCo-product / header batch inherits minimum SLED", 650, 930, 420, 80, "#ffedd5", "#ea580c", "out"),
        arch_box("qc", "LIMS / QC / BRR\nCoA • retention sample • release register", 1150, 930, 360, 80, "#fef3c7", "#ca8a04", "out"),
        arch_box("del", "SAP Delivery\nclinic / hospital", 1630, 930, 300, 80, "#dbeafe", "#2563eb", "out"),
        e("g01", "so", "plasmida", "Patient ID → A", "dashed=1;endArrow=open;html=1;"), e("g02", "so", "plasmidb", "Patient ID → B", "dashed=1;endArrow=open;html=1;"),
        e("g03", "plasmida", "a0", "batch", None), e("g04", "plasmidb", "b0", "batch", None), e("g05", "a0", "a1", "GI / GR", None), e("g06", "a1", "a2", "GI / GR", None), e("g07", "a2", "a3", "GI / GR", None), e("g08", "a3", "a4", "GI / GR", None), e("g09", "a4", "merge", "GI / GR", None),
        e("g10", "b0", "b1", "GI / GR", None), e("g11", "b1", "b2", "GI / GR", None), e("g12", "b2", "b3", "GI / GR", None), e("g13", "b3", "b4", "GI / GR", None), e("g14", "b4", "merge", "GI / GR", None),
        e("g15", "merge", "qc", "inspection / BRR", "dashed=1;endArrow=open;html=1;"), e("g16", "qc", "del", "released batch", "dashed=1;endArrow=open;html=1;"),
        note("tn1", "The sources show both a simple 4711-1 … 4711-11 chain and a two-leg A/B conversion example. This page keeps both semantics visible; exact order-to-stage mapping must be validated.", 60, 1090, 760, 85),
        note("tn2", "Genealogy controls: FEFO assignment, batch classification, minimum component SLED inherited by header kit, no component batch split, and patient ID carried across orders.", 850, 1090, 700, 85),
        note("tn3", "Source examples include ZDTM, ZRMG, ZLPX, ZF&F, ZVVL and ZVLPF process types; naming / number ranges remain validation items.", 1580, 1090, 760, 85),
    ]
    return page("06 Architecture Traceability", c, 2400, 1230)


def page7_operating_model():
    c = [title("t", "SUPPORT 01 — Planning hierarchy and resource model", "Supporting architecture/operating model from PL2PR-01 and PL2PR-03: planning horizons feed capacity, resource networks and shop-floor execution")]
    c += [
        arch_layer("h", "Planning hierarchy / time horizon", 30, 105, 1500, 720, "#f8fafc", "#94a3b8"),
        arch_layer("r", "Resource hierarchy and network", 1580, 105, 790, 720, "#eef2ff", "#818cf8"),
        arch_layer("x", "Execution connection", 30, 860, 2340, 180, "#f0fdf4", "#4ade80"),
        arch_box("h1", "Annual operations plan\nprofitability / strategic planning", 120, 165, 1200, 70, "#e0e7ff", "#4f46e5", "h"),
        arch_box("h2", "S&OP / demand and supply balancing\nup to 18 months", 120, 270, 1200, 70, "#e0e7ff", "#4f46e5", "h"),
        arch_box("h3", "RCCP + demand management\nup to 6 months", 120, 375, 1200, 70, "#dbeafe", "#2563eb", "h"),
        arch_box("h4", "MPS + MRP / pMRP\nup to 4 weeks", 120, 480, 1200, 70, "#dbeafe", "#2563eb", "h"),
        arch_box("h5", "CRP / leveling + detailed scheduling\nup to 1 week", 120, 585, 1200, 70, "#dcfce7", "#16a34a", "h"),
        arch_box("h6", "SFC / shop-floor control\nexecution and confirmations", 120, 690, 1200, 70, "#ffedd5", "#ea580c", "h"),
        e("h01", "h1", "h2"), e("h02", "h2", "h3"), e("h03", "h3", "h4"), e("h04", "h4", "h5"), e("h05", "h5", "h6"),
        arch_box("r1", "Plant 1 / Plant 2", 1640, 165, 250, 60, "#e0e7ff", "#4f46e5", "r"),
        arch_box("r2", "Line / resource group", 1640, 280, 250, 60, "#dbeafe", "#2563eb", "r"),
        arch_box("r3", "Resource network\npredecessor / successor flow", 1640, 395, 250, 70, "#dbeafe", "#2563eb", "r"),
        arch_box("r4", "Planning resource\nselect individual unit at execution", 1640, 525, 250, 75, "#dcfce7", "#16a34a", "r"),
        arch_box("r5", "Example path\nB1/B2 → R1/R2/R3 → E1\ncharging → reaction → discharging", 1640, 655, 300, 90, "#ffedd5", "#ea580c", "r"),
        e("r01", "r1", "r2"), e("r02", "r2", "r3"), e("r03", "r3", "r4"), e("r04", "r4", "r5"),
        arch_box("ex1", "APS / capacity decision", 140, 915, 260, 65, "#e0e7ff", "#4f46e5", "x"),
        arch_box("ex2", "S/4 MRP / process-order chain", 520, 915, 300, 65, "#dbeafe", "#2563eb", "x"),
        arch_box("ex3", "PAS-X / EWM execution", 940, 915, 260, 65, "#dcfce7", "#16a34a", "x"),
        arch_box("ex4", "LIMS / release / delivery", 1320, 915, 260, 65, "#fef3c7", "#ca8a04", "x"),
        arch_box("ex5", "Feedback: dates, quantities, exceptions", 1700, 915, 400, 65, "#ffedd5", "#ea580c", "x"),
        e("q01", "ex1", "ex2"), e("q02", "ex2", "ex3"), e("q03", "ex3", "ex4"), e("q04", "ex4", "ex5"), e("q05", "ex5", "ex1", "re-plan loop", None, [(2000, 900), (2000, 875), (270, 875), (270, 950)]),
        note("sn1", "pMRP is shown as a simulation path; sources describe restricted master-data scope, immediate simulation and simplified deterministic lot-for-lot logic.", 60, 1065, 730, 70),
        note("sn2", "Resource networks describe physical predecessor/successor links; resource hierarchies aggregate capacity from subordinate resources for rough-cut and medium-term planning.", 830, 1065, 730, 70),
        note("sn3", "Open point: exact plant, line and resource hierarchy, plus the external APS choice, are not fully decided in the source material.", 1600, 1065, 770, 70),
    ]
    return page("07 Supporting Operating Model", c, 2400, 1200)


def main():
    pages = [page1_bpmn_e2e(), page2_bpmn_planning(), page3_bpmn_execution(), page4_arch_logical(), page5_arch_integration(), page6_arch_traceability(), page7_operating_model()]
    xml = '<?xml version="1.0" encoding="UTF-8"?><mxfile host="drawio" version="26.0.0" type="device">' + ''.join(pages) + '</mxfile>'
    OUT.write_text(xml, encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
