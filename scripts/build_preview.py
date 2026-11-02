#!/usr/bin/env python3
"""Builds preview/index.html — a self-contained HTML mock of the Kulinaria MX storefront.

It inlines assets/kulinaria.css and assets/kulinaria.js so the preview looks and behaves
like the Liquid theme (countdown, pause locks, filters, allergen profile, cart gating).
Run:  python3 scripts/build_preview.py
"""
import html
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
css = (ROOT / "assets" / "kulinaria.css").read_text()
js = (ROOT / "assets" / "kulinaria.js").read_text()

TIER_LABEL = {"selecto": "Selecto", "exclusivo": "Exclusivo $", "signature": "Signature $$", "reserve": "Reserve $$$"}
TIER_PRICE = {"selecto": 160, "exclusivo": 220, "signature": 280, "reserve": 340}

DISHES = [
    ("Pollo a las hierbas con puré rústico", "selecto", "diario-premium", ["keto"], ["Lácteos"], ["Pollo", "Papa", "Mantequilla", "Hierbas"], 480, 22),
    ("Bowl de res magra y quinoa", "selecto", "bowls-de-la-semana", ["alto-proteina", "sin-gluten"], [], ["Res magra", "Quinoa", "Aguacate", "Cilantro"], 560, 34),
    ("Salmón gourmet en costra de almendras", "exclusivo", "al-fuego-y-mar", ["keto", "bajo-carbos"], ["Frutos secos", "Pescado"], ["Salmón", "Almendra", "Espárragos", "Jitomate cherry", "Limón"], 520, 14),
    ("Omelette de claras con espinaca", "selecto", "desayunos-premium", ["vegetariano", "bajo-calorias"], ["Huevo"], ["Claras", "Espinaca", "Champiñones"], 310, 8),
    ("Arrachera al carbón con maíz y espárragos", "signature", "al-fuego-y-mar", ["alto-proteina", "sin-gluten"], [], ["Arrachera", "Maíz", "Espárragos", "Micro hierbas"], 640, 28),
    ("Filete Prime con verduras asadas", "reserve", "al-fuego-y-mar", ["keto", "alto-proteina", "sin-gluten"], [], ["Res Prime", "Brócoli", "Zanahoria", "Mantequilla"], 710, 16),
    ("Bowl vegano de garbanzo y tahini", "exclusivo", "bowls-de-la-semana", ["vegano", "vegetariano", "sin-gluten"], ["Ajonjolí"], ["Garbanzo", "Tahini", "Pepino", "Cebolla"], 450, 52),
    ("Mini pasta de pollo para peques", "selecto", "kulinaria-junior", [], ["Gluten", "Lácteos"], ["Pasta", "Pollo", "Queso", "Jitomate"], 380, 44),
]


def dish_card(i, d):
    name, tier, cat, diets, allergens, ings, kcal, carbs = d
    return f"""
    <article class="dish" data-dish data-category="{cat}" data-tier="{tier}" data-diets="{'|'.join(diets)}"
      data-allergens="{html.escape('|'.join(allergens))}" data-ingredients="{html.escape('|'.join(ings))}">
      <a class="dish__media surface-walnut" href="#/ficha" aria-label="{html.escape(name)}"><span class="dish__ph surface-slate" aria-hidden="true">K</span></a>
      <div class="dish__body">
        <div><span class="tier-badge tier-badge--{tier}">{TIER_LABEL[tier]}</span></div>
        <h3 class="dish__title"><a href="#/ficha">{html.escape(name)}</a></h3>
        <p class="dish__facts">{kcal} kcal · {carbs} g carbohidratos</p>
        <span class="compat" data-compat></span>
        <div class="dish__meta"><span class="dish__price">${TIER_PRICE[tier]}</span><a class="btn btn--outline" href="#/ficha">Ver ficha</a></div>
      </div>
      <div class="dish__blocked" role="note"><div><strong>No apto para tu perfil</strong>Contiene un ingrediente que declaraste como alergia.</div></div>
    </article>"""


def chip_buttons(group, items, all_label=None):
    out = ""
    if all_label:
        out += f'<button class="chip" type="button" data-filter="{group}" data-value="all" aria-pressed="true">{all_label}</button>'
    for v, l in items:
        out += f'<button class="chip" type="button" data-filter="{group}" data-value="{v}" aria-pressed="false">{l}</button>'
    return out


CATS = [("desayunos-premium", "Desayunos Premium"), ("al-fuego-y-mar", "Al Fuego y Mar"), ("bowls-de-la-semana", "Bowls de la Semana"),
        ("diario-premium", "Diario Premium"), ("kulinaria-junior", "Kulinaria Junior")]
DIETS = [("keto", "Keto"), ("sin-gluten", "Libre de gluten"), ("vegetariano", "Vegetariano"), ("vegano", "Vegano"),
         ("bajo-calorias", "Bajas calorías"), ("bajo-carbos", "Bajos carbohidratos"), ("alto-proteina", "Alta proteína")]
TIERS = [(k, v) for k, v in TIER_LABEL.items()]

LOGO = """<span class="logo logo--gold" role="img" aria-label="Kulinaria"><span class="logo__k" aria-hidden="true">K</span><span class="logo__word" aria-hidden="true"><span class="logo__name">ulinaria</span><span class="logo__rule"></span><span class="logo__tag">Arte del fuego</span></span></span>"""

ICON = {
    "bag": '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    "user": '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    "menu": '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
    "instagram": '<rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><circle cx="17.5" cy="6.5" r="0.9"/>',
    "tiktok": '<path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"/>',
    "whatsapp": '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M9 9.5c.4 2.2 2.3 4.2 5 5.2l1.4-1.4-2-1-.9.8c-.8-.4-1.5-1.1-1.9-1.9l.8-.9-1-2z"/>',
}


def icon(n):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{ICON[n]}</svg>'


def head(eyebrow, title, text=""):
    t = f'<p class="lede">{text}</p>' if text else ""
    return f'<div class="section__head"><span class="eyebrow">{eyebrow}</span><h2>{title}</h2><div class="divider-gold"><i></i></div>{t}</div>'


def card(title, text, num=None, eyebrow=None, link=None, label=None, tag="div"):
    n = f'<span class="card__num">{num}</span>' if num else ""
    e = f'<span class="eyebrow">{eyebrow}</span>' if eyebrow else ""
    l = f'<a class="btn btn--ghost" style="margin-top:auto;align-self:flex-start" href="{link}">{label}</a>' if link and label else ""
    return f'<{tag} class="card">{n}{e}<h3>{title}</h3><div class="richtext text-muted">{text}</div>{l}</{tag}>'


def grid(cols, cards):
    return f'<div class="grid grid--{cols}">{"".join(cards)}</div>'


def section(inner, cls=""):
    return f'<section class="section {cls}"><div class="container">{inner}</div></section>'


def hero(eyebrow, h, text, b1, l1, b2=None, l2=None, countdown=True):
    cd = '<p><span class="countdown" data-cutoff>Cierre de pedidos en <strong data-cutoff-value>…</strong></span></p>' if countdown else ""
    sec = f'<a class="btn btn--outline" href="{l2}">{b2}</a>' if b2 else ""
    return f"""<section class="hero surface-walnut"><div class="container hero__grid">
      <div class="hero__copy"><span class="eyebrow">{eyebrow}</span><h1>{h}</h1><div class="divider-gold"><i></i></div>
      <p class="lede" style="color:var(--cream-200)">{text}</p>{cd}
      <div class="btn-row"><a class="btn btn--gold" href="{l1}">{b1}</a>{sec}</div></div>
      <div class="plate surface-slate"><div class="plate--logo">{LOGO}</div></div></div></section>"""


def tier_card(t, text):
    cls = " tier-card--reserve" if t == "reserve" else ""
    return f'<article class="card tier-card{cls}"><span class="tier-badge tier-badge--{t}">{TIER_LABEL[t]}</span><p class="tier-card__price gold-text">${TIER_PRICE[t]}<small> MXN</small></p><p class="text-muted" style="margin:0">por platillo</p><div class="divider-gold" style="margin:16px auto"><i></i></div><p class="text-muted">{text}</p></article>'


def faq(items, bg=""):
    d = "".join(f"<details><summary>{q}</summary><div class='richtext'>{a}</div></details>" for q, a in items)
    return f'<div class="accordion">{d}</div>'


def cta(h="Empieza tu bloque de 4 semanas", t="Elige tu plan, cuéntanos tus alergias y nosotros nos encargamos del resto."):
    return f"""<section class="cta-banner surface-walnut"><div class="container"><div class="panel panel--slate surface-slate">
      <span class="eyebrow">Arte del fuego</span><h2>{h}</h2><div class="divider-gold" style="margin-inline:auto"><i></i></div>
      <p class="lede" style="margin-inline:auto">{t}</p><p><span class="countdown" data-cutoff>Cierre de pedidos en <strong data-cutoff-value>…</strong></span></p>
      <div class="btn-row" style="justify-content:center"><a class="btn btn--gold" href="#/planes">Elegir mi plan</a></div></div></div></section>"""


# ------------------------------------------------------------------ pages
trial = round(160 * 1.15)

home = hero("Comida saludable premium a domicilio", "Tu semana, servida como una pieza de autor",
            "Platillos preparados por chefs, adaptados a tu estilo de vida y entregados en envases de vidrio. Elige tu bloque de 4 semanas y olvídate de cocinar.",
            "Elegir mi plan", "#/planes", "Ver el menú de la semana", "#/menu")
home += section(head("Cómo funciona", "Tres pasos y tu semana está resuelta") + grid(3, [
    card("Elige tu plan", "<p>Bloques de 4 semanas con entrega semanal. ¿Quieres probar? Compra una sola semana.</p>", "01"),
    card("Elige tus platillos", "<p>Un menú rotativo de 8 a 10 opciones. Confirma antes del sábado a las 10:00 AM o nosotros armamos tu pedido.</p>", "02"),
    card("Recíbelo en casa", "<p>Entrega a domicilio en envases de vidrio de alta calidad. Pago 100% digital.</p>", "03")]), "section--raised")
home += section(head("Menú de la semana", "Esta semana en Kulinaria", "Un menú rotativo de 8 a 10 platillos. Cada uno con una sola foto del emplatado final, vista desde arriba.")
                + '<div class="dish-grid">' + "".join(dish_card(i, d) for i, d in enumerate(DISHES[:4])) + '</div>'
                + '<div class="btn-row"><a class="btn btn--outline" href="#/menu">Ver el menú completo</a></div>')
home += section(head("Niveles", "Cuatro niveles, un mismo estándar", "Cada nivel suma $60 MXN fijos sobre el anterior. El precio incluye el empaque óptimo y la preparación del chef.").replace('class="section__head"', 'class="section__head section__head--center"')
                + grid(4, [tier_card("selecto", "Menú base diario: cocina saludable, balanceada y dietas adaptables."),
                           tier_card("exclusivo", "Cocciones lentas y elaboraciones sofisticadas."),
                           tier_card("signature", "Recetas con sello de autor y cortes premium."),
                           tier_card("reserve", "Cortes Prime y mariscos selectos, listos para recalentar.")]))
home += section(head("Enfoque nutricional", "Filtra el menú según tu estilo de vida") + '<div class="chips">' + "".join(f'<a class="chip" href="#/menu">{l}</a>' for _, l in DIETS) + '</div>', "section--raised")
home += section(head("Planes", "Elige cómo quieres empezar", "La suscripción se contrata en bloques de 4 semanas. Si prefieres probar, puedes comprar una sola semana.").replace('class="section__head"', 'class="section__head section__head--center"')
                + f"""<div class="grid grid--2" style="max-width:980px;margin-inline:auto">
  <article class="card plan-card plan-card--featured"><span class="plan-card__flag">Recomendado</span><span class="eyebrow">Bloque de 4 semanas</span>
    <p class="plan-card__price gold-text">Desde $160<small style="font-size:1rem;font-family:var(--font-body);color:var(--text-muted)"> / platillo</small></p>
    <p class="text-muted">Suscripción renovable con entrega semanal. Es la opción con mejor precio.</p>
    <ul class="plan-list"><li>Precio prorrateado más bajo</li><li>Selección automática si no eliges antes del sábado</li><li>Pausas flexibles con saldo a favor</li><li>Código de referencia propio y monedero</li></ul>
    <a class="btn btn--gold btn--block" style="margin-top:auto" href="#/registro">Elegir bloque de 4 semanas</a></article>
  <article class="card plan-card"><span class="eyebrow">Semana de prueba</span>
    <p class="plan-card__price">${trial}<small style="font-size:1rem;font-family:var(--font-body);color:var(--text-muted)"> / platillo</small></p>
    <p class="text-muted">Una sola semana para conocer el servicio. <strong style="color:var(--gold-300)">15% más cara</strong> que el precio prorrateado del bloque.</p>
    <ul class="plan-list"><li>Sin compromiso de renovación</li><li>Compra hasta el sábado 10:00 AM</li><li>Pago digital, sin efectivo</li></ul>
    <a class="btn btn--outline btn--block" style="margin-top:auto" href="#/registro">Probar una semana</a></article></div>""")
home += section(head("Más Kulinaria", "Experiencias y comunidad") + grid(3, [
    card("Carta Kulinaria", "<p>Chef privado a domicilio y cenas románticas de los sábados. Cotización privada, sin precios.</p>", eyebrow="Fuera de la suscripción", link="#/carta", label="Conocer la carta"),
    card("Programa de Embajadores", "<p>Recomienda Kulinaria y gana bonos, ropa deportiva y estatus de Entrenador Personal de Alta Clase.</p>", eyebrow="Entrenadores y gimnasios", link="#/embajadores", label="Ver el programa"),
    card("Kulinaria Store", "<p>Playera oficial y vaso mezclador premium. Gratis con tu primer bloque si llegas con código.</p>", eyebrow="Fit Apparel", link="#/tienda", label="Ir a la tienda")]), "section--raised")
home += section(head("Ayuda", "Preguntas frecuentes") + faq([
    ("¿Hasta cuándo puedo elegir mis platillos?", "<p>Hasta el sábado a las 10:00 AM. Si no eliges, armamos tu pedido con tu plan, historial y alergias.</p>"),
    ("¿Puedo pausar mi suscripción?", "<p>Sí: jueves y viernes hasta el martes 10:00 AM; lunes a miércoles hasta el viernes 7:00 PM. Lo no preparado queda como saldo.</p>"),
    ("¿Cómo se paga?", "<p>Todo se cobra de forma digital en la web. No se acepta efectivo.</p>")]))
home += cta()

menu = section(
    '<div class="section__head"><span class="eyebrow">Menú de la semana</span><h1 style="font-size:clamp(2.2rem,4vw,3.4rem)">Menú semanal</h1><div class="divider-gold"><i></i></div>'
    '<p><span class="countdown" data-cutoff>Confirma tus platillos antes del sábado 10:00 AM · quedan <strong data-cutoff-value>…</strong></span></p>'
    '<p class="legal-note">Si no registras tus opciones a tiempo, se genera un pedido automático con tu plan, historial y perfil de alergias.</p></div>'
    '<div class="filter-bar" data-filters>'
    f'<div class="filter-bar__row"><span class="filter-bar__label">Categoría</span><div class="chips">{chip_buttons("category", CATS, "Todo")}</div></div>'
    f'<div class="filter-bar__row"><span class="filter-bar__label">Enfoque</span><div class="chips">{chip_buttons("diet", DIETS)}</div></div>'
    f'<div class="filter-bar__row"><span class="filter-bar__label">Nivel</span><div class="chips">{chip_buttons("tier", TIERS, "Todos")}</div></div>'
    f'<div class="filter-bar__row" style="justify-content:space-between"><span class="text-muted"><strong data-count>{len(DISHES)}</strong> platillos</span><a class="btn btn--ghost" href="#/perfil">Declara tus alergias para filtrar el menú</a></div></div>'
    '<div class="dish-grid">' + "".join(dish_card(i, d) for i, d in enumerate(DISHES)) + '</div><p class="alert" data-empty hidden>Ningún platillo coincide con los filtros elegidos.</p>')

ficha = section(f"""<div class="product" data-dish-detail data-allergens="Frutos secos|Pescado" data-ingredients="Salmón|Almendra|Eneldo|Espárragos|Jitomate cherry|Limón">
  <div class="product__media surface-walnut"><span class="dish__ph surface-slate" style="font-size:6rem" aria-hidden="true">K</span></div>
  <div class="product__info">
    <div><div style="display:flex;gap:12px;align-items:center;margin-bottom:16px"><span class="tier-badge tier-badge--exclusivo">Exclusivo $</span><span class="eyebrow" style="margin:0">al fuego y mar</span></div>
    <h1 style="font-size:clamp(2rem,3.4vw,3rem)">Salmón gourmet en costra de almendras</h1><p class="tagline" style="font-size:2rem;margin:0">$220</p></div>
    <div class="alert" data-allergen-alert hidden role="alert"></div>
    <div class="richtext lede" style="color:var(--cream-200)"><p>Lomo de salmón con costra de almendras y eneldo, espárragos asados y jitomate cherry rostizado.</p></div>
    <div class="spec-list"><div class="spec"><b>520</b><span>Calorías (kcal)</span></div><div class="spec"><b>14 g</b><span>Carbohidratos</span></div></div>
    <p class="legal-note">El peso de la proteína se establece en bruto antes de su cocción. La contracción natural durante el proceso de preparación culinaria puede dar como resultado un peso inferior al publicado, quedando sujeto a variaciones.</p>
    <div><h3>Ingredientes</h3><p class="text-muted">Declaración explícita de cada ingrediente para la prevención de alergias.</p><div class="chips"><span class="chip" style="cursor:default">Salmón</span><span class="chip" style="cursor:default">Almendra</span><span class="chip" style="cursor:default">Eneldo</span><span class="chip" style="cursor:default">Espárragos</span><span class="chip" style="cursor:default">Jitomate cherry</span><span class="chip" style="cursor:default">Limón</span></div></div>
    <div><h3>Contiene</h3><div class="chips"><span class="tier-badge tier-badge--exclusivo">Frutos secos</span><span class="tier-badge tier-badge--exclusivo">Pescado</span></div></div>
    <form onsubmit="event.preventDefault();location.hash='#/carrito'">
      <fieldset class="plan-picker"><legend>Cómo quieres recibirlo</legend>
        <label><input type="radio" name="selling_plan" checked><span><strong>Bloque de 4 semanas (pago anticipado, entrega semanal)</strong><br><small class="text-muted">Un pago por bloque. 4 entregas semanales.</small></span></label>
        <label><input type="radio" name="selling_plan"><span><strong>Compra única</strong><br><small class="text-muted">Un solo pago, sin renovación.</small></span></label></fieldset>
      <div class="btn-row" style="align-items:center"><input class="input qty" type="number" value="1" min="1" aria-label="Cantidad"><button class="btn btn--gold" type="submit" data-add>Agregar a mi selección</button></div></form>
  </div></div>""")

planes = home_plans = section(head("Planes", "Elige cómo quieres empezar", "La suscripción se contrata en bloques de 4 semanas. Si prefieres probar, puedes comprar una sola semana.").replace('class="section__head"', 'class="section__head section__head--center"')
    + grid(4, [tier_card("selecto", "Menú base diario y de alta rotación."), tier_card("exclusivo", "Cocciones lentas y elaboraciones sofisticadas."),
               tier_card("signature", "Recetas de autor con cortes premium."), tier_card("reserve", "Prime y mariscos selectos.")]))
planes += section(head("Calendario del ciclo", "Así corre tu semana") + grid(4, [
    card("Sábado 10:00 AM", "<p>Cierre de pedidos. Si no elegiste, a las 10:01 AM se arma tu pedido automático.</p>", "01"),
    card("Lunes a miércoles", "<p>Primera mitad de entregas. Pausa hasta el viernes 7:00 PM.</p>", "02"),
    card("Martes 10:00 AM", "<p>Último momento para pausar entregas de jueves y viernes.</p>", "03"),
    card("Jueves y viernes", "<p>Segunda mitad de entregas. Viernes 7:00 PM: corte de renovación.</p>", "04")]), "section--raised")
planes += section(head("Políticas clave", "Lo que debes saber antes de suscribirte") + faq([
    ("Pago digital, cero efectivo", "<p>Toda suscripción o renovación se cobra en la web al hacer el pedido.</p>"),
    ("Sin reembolso tras liquidar", "<p>Los insumos se compran en volumen: no hay cancelación ni devolución. Si pausas a tiempo, lo no preparado queda como saldo.</p>"),
    ("Caducidad por inactividad", "<p>Tras una pausa tienes 30 días naturales para reanudar; después el contrato se cancela y se pierde el saldo.</p>")]))
planes += cta()

carta = hero("Fuera del menú de suscripción", "Carta Kulinaria", "Experiencias ultra-premium de diseño exclusivo: chef privado a domicilio y cenas románticas de los sábados.", "Solicitar cotización privada", "#cotizacion", countdown=False)
carta += section(head("Experiencias", "Diseñadas a tu medida") + grid(3, [
    card("Chef privado a domicilio", "<p>Un menú de autor preparado en tu casa para eventos especiales.</p>"),
    card("Cenas románticas de los sábados", "<p>Una noche pensada al detalle: ambientación, menú y servicio.</p>"),
    card("Eventos especiales", "<p>Cumpleaños, aniversarios y reuniones íntimas con sello Kulinaria.</p>")]))
carta += section(head("Cotización privada", "Cuéntanos tu evento", "Esta sección no usa carrito ni precios publicados.") + """<form onsubmit="event.preventDefault();this.querySelector('.alert').hidden=false" id="cotizacion" style="max-width:860px">
  <div class="form-grid"><div class="field"><label>Nombre completo</label><input class="input" required></div><div class="field"><label>Correo</label><input class="input" type="email" required></div>
  <div class="field"><label>Teléfono / WhatsApp</label><input class="input" type="tel" required></div><div class="field"><label>Tipo de experiencia</label><select class="select"><option>Chef privado a domicilio</option><option>Cena romántica de sábado</option><option>Evento especial</option></select></div>
  <div class="field"><label>Fecha deseada</label><input class="input" type="date"></div><div class="field"><label>Invitados</label><input class="input" type="number" min="1"></div></div>
  <div class="field"><label>Cuéntanos más</label><textarea class="textarea"></textarea></div><button class="btn btn--gold" type="submit">Solicitar cotización</button>
  <p class="alert alert--ok form-msg" hidden>Gracias. Te contactaremos muy pronto.</p></form>""", "section--raised")

embajadores = hero("Programa de embajadores", "Recomienda Kulinaria y gana con cada cliente", "Tres ramas para crecer juntos: entrenadores (ropa y efectivo), clientes (crédito interno) y gimnasios aliados (alto volumen).", "Quiero ser embajador", "#alta", countdown=False)
embajadores += section(head("Tres ramas", "Elige cómo quieres participar") + grid(3, [
    card("Entrenadores", "<p>Bono en efectivo, kit Fit Edition, video cooperativo y estatus web premium.</p>", eyebrow="Ropa y efectivo"),
    card("Clientes", "<p>Comparte tu código y gana saldo a favor por cada amigo que compre su primer bloque.</p>", eyebrow="Crédito interno viral"),
    card("Gimnasios aliados", "<p>Monetización pasiva con comisiones en efectivo y bono de élite.</p>", eyebrow="Alto volumen")]))
embajadores += section(head("Entrenadores", "De la meta inicial al crecimiento continuo") + grid(3, [
    card("Meta inicial", "<ul><li>Mínimo 10 clientes nuevos recomendados.</li><li>Cada uno con 1 bloque de 4 semanas.</li><li>Facturas liquidadas.</li></ul>", "01"),
    card("Activación (primeros 10)", "<ul><li>Bono de $1,500 MXN en efectivo.</li><li>Kit Gear Kulinaria Fit Edition.</li><li>Video promocional cooperativo.</li><li>Estatus web: Entrenador Personal de Alta Clase.</li></ul>", "02"),
    card("Incentivos continuos", "<ul><li>Vía A: $100 MXN por cada renovación.</li><li>Vía B: $1,500 MXN cada 10 clientes nuevos pagados.</li></ul>", "03")]), "section--raised")
embajadores += section(head("Gimnasios aliados", "Una alianza de monetización pasiva") + grid(3, [
    card("Código institucional", "<p>Alta como Gimnasio Aliado con código único (ej. GYM_ZONE).</p>"),
    card("Comisiones", "<ul><li>$100 MXN por cliente nuevo.</li><li>$100 MXN por cada renovación.</li></ul>"),
    card("Gimnasio Embajador", "<p>A los 100 clientes activos: bono único de $10,000 MXN y video promocional cruzado.</p>")]))
embajadores += section(head("Reglas claras", "Primero en registrar, primero en ganar") + faq([
    ("Un cliente, un código", "<p>Un cliente solo puede estar ligado a un código. Si lo registra un entrenador, el código del gimnasio ya no aplica.</p>"),
    ("No interferencia", "<p>El gimnasio no re-apadrina clientes de entrenadores; intentarlo es motivo de rescisión inmediata.</p>")]), "section--raised")

tienda = section(head("Kulinaria Store", "Fit Apparel", "Playera oficial y vaso mezclador premium. Con código de referencia válido y tu primer bloque pagado, elige uno gratis.")
                 + '<div class="dish-grid">' + "".join(
    f'<article class="dish"><a class="dish__media surface-slate" href="#/carrito"><span class="dish__ph surface-walnut">K</span></a><div class="dish__body"><h3 class="dish__title">{n}</h3><div class="dish__meta"><span class="dish__price">${p}</span><a class="btn btn--outline" href="#/carrito">Ver</a></div></div></article>'
    for n, p in [("Playera oficial Kulinaria", 399), ("Vaso mezclador (shaker) premium", 299)]) + '</div>')

perfil = section(head("Tu perfil", "Cuéntanos qué no puedes (o no quieres) comer", "Este cuestionario es obligatorio al inscribirte.") + """
<form data-profile-form class="panel panel--gold" novalidate style="max-width:860px">
  <h3>Bloque 1 · Alergias y restricciones médicas <span class="tier-badge tier-badge--exclusivo" style="vertical-align:middle;margin-left:8px">Crítico</span></h3>
  <p class="text-muted">Los platillos que contengan estos ingredientes se bloquean por completo en tu menú.</p>
  <div class="check-grid">""" + "".join(f'<label class="check"><input type="checkbox" name="allergy" value="{a}"> <span>{a}</span></label>' for a in ["Gluten", "Lácteos", "Frutos secos", "Mariscos"]) + """</div>
  <div class="field"><label for="ao">Otras alergias</label><input class="input" id="ao" name="allergy_other" placeholder="Separa con comas: soya, huevo, ajonjolí"></div>
  <hr style="border:0;border-top:1px solid var(--border);margin:40px 0">
  <h3>Bloque 2 · Ingredientes que no me gustan</h3>
  <div class="tag-input" data-tags><input type="text" data-tag-input placeholder="Ej. jitomate" aria-label="Agregar ingrediente"></div>
  <div class="chips" style="margin-top:12px">""" + "".join(f'<button class="chip" type="button" data-suggest="{s}">+ {s}</button>' for s in ["Cebolla", "Cilantro", "Carne de puerco", "Pasas"]) + """</div>
  <p class="legal-note" style="margin-top:24px">El sitio cruza los ingredientes con el perfil que declaraste. Eres responsable de declarar con detalle tus alergias y restricciones.</p>
  <button class="btn btn--gold" type="submit">Guardar mi perfil</button>
  <p class="alert alert--ok form-msg" data-profile-msg hidden role="status">Perfil guardado. Abre el menú: ya se filtra con tus datos.</p>
</form>""")

carrito = section(head("Mi selección", "Mi selección") + """
<form class="cart" data-cart-form onsubmit="event.preventDefault()">
  <div>
    <div class="cart-line"><span class="dish__ph surface-slate" style="width:96px;font-size:2rem">K</span>
      <div><h3 style="margin:0 0 4px">Bowl de res magra y quinoa</h3><p class="cart-line__plan" style="margin:0">Bloque de 4 semanas (pago anticipado, entrega semanal)</p><a class="btn btn--ghost" style="padding-left:0" href="#">Quitar</a></div>
      <div style="text-align:right"><input class="input qty" type="number" value="5" min="0"><p class="dish__price" style="margin:8px 0 0">$800</p></div></div>
    <div class="cart-line"><span class="dish__ph surface-slate" style="width:96px;font-size:2rem">K</span>
      <div><h3 style="margin:0 0 4px">Salmón gourmet en costra de almendras</h3><p class="cart-line__plan" style="margin:0">Bloque de 4 semanas (pago anticipado, entrega semanal)</p><a class="btn btn--ghost" style="padding-left:0" href="#">Quitar</a></div>
      <div style="text-align:right"><input class="input qty" type="number" value="5" min="0"><p class="dish__price" style="margin:8px 0 0">$1,100</p></div></div>
  </div>
  <aside class="summary">
    <div class="panel"><h3>Código de referencia</h3><p class="text-muted">Si un entrenador, amigo o gimnasio te recomendó, escribe su código.</p>
      <div class="field"><label for="ref">Código</label><input class="input" id="ref" data-referral placeholder="JUANFIT" autocomplete="off" style="text-transform:uppercase"></div>
      <p class="alert alert--ok" data-referral-msg hidden>Código guardado. Se valida al confirmar el pago de tu primer bloque.</p>
      <div data-gift hidden style="margin-top:24px"><h3>Tu regalo de bienvenida</h3><p class="text-muted">Elige uno sin costo con tu primer bloque.</p>
        <div class="gift-options"><label><input type="radio" name="gift" checked><span>Playera oficial Kulinaria <s class="text-muted">$399</s> <strong style="color:var(--gold-300)">$0</strong></span></label>
        <label><input type="radio" name="gift"><span>Vaso mezclador premium <s class="text-muted">$299</s> <strong style="color:var(--gold-300)">$0</strong></span></label></div></div></div>
    <div class="panel panel--gold"><div class="summary__row"><span class="text-muted">Subtotal</span><span>$1,900</span></div>
      <div class="summary__row" style="margin-top:16px"><strong>Total</strong><span class="summary__total gold-text">$1,900</span></div>
      <p class="text-muted" style="font-size:.85rem">Pago 100% digital. No se acepta efectivo.</p>
      <label class="check" style="margin:24px 0"><input type="checkbox" data-contract><span>Acepto el contrato de adhesión y los términos de servicio de Kulinaria MX, incluida la selección automática de los sábados, las reglas de renovación y la política de no reembolso.</span></label>
      <button class="btn btn--gold btn--block" type="submit" data-checkout disabled>Continuar al pago</button></div></aside></form>""")

cuenta = section("""<div class="section__head"><span class="eyebrow">Mi cuenta</span><h1 style="font-size:clamp(2.2rem,4vw,3.4rem)">Hola, Ramón</h1><div class="divider-gold"><i></i></div>
<p class="lede">Tienes el control total de tu semana: elige tus platillos, pausa tu bloque, revisa tu saldo y comparte tu código.</p></div>
<div class="account"><nav class="account-nav" aria-label="Mi cuenta"><a href="#cuenta-semana">Mi semana</a><a href="#cuenta-pausas">Pausar entregas</a><a href="#cuenta-monedero">Monedero</a><a href="#cuenta-ref">Mis referidos</a></nav>
<div>
  <div class="account-block" id="cuenta-semana"><h2>Mi semana</h2><div class="panel panel--gold"><p class="countdown" data-cutoff>Confirma tus platillos antes del sábado 10:00 AM · quedan <strong data-cutoff-value>…</strong></p>
    <p class="text-muted">Si no registras tus opciones a tiempo, el sábado a las 10:01 AM se genera un pedido automático con tu plan, historial y alergias registradas.</p>
    <div class="btn-row"><a class="btn btn--gold" href="#/menu">Elegir platillos</a><a class="btn btn--outline" href="#">Administrar suscripción</a></div></div></div>
  <div class="account-block" id="cuenta-pausas"><h2>Pausar próximo bloque de entregas</h2><p class="text-muted">Las ventanas se bloquean automáticamente (hora de Ciudad de México).</p>
    <div class="pause-grid">
      <div class="card"><h3>Entregas de jueves y viernes</h3><p class="text-muted">Pausa a más tardar el martes a las 10:00 AM.</p>
        <a class="btn btn--outline" data-pause-lock data-lock-day="2" data-lock-hour="10" href="#">Pausar próximo bloque de entregas</a>
        <p class="alert alert--warn" data-lock-msg hidden>Tiempo límite de pausa agotado para el siguiente periodo</p><p class="text-muted" data-lock-left style="font-size:.85rem"></p></div>
      <div class="card"><h3>Entregas de lunes a miércoles</h3><p class="text-muted">Pausa a más tardar el viernes a las 7:00 PM. Si no pausas, tu nuevo pedido se asigna el sábado a las 10:00 AM.</p>
        <a class="btn btn--outline" data-pause-lock data-lock-day="5" data-lock-hour="19" href="#">Pausar próximo bloque de entregas</a>
        <p class="alert alert--warn" data-lock-msg hidden>Tiempo límite de pausa agotado para el siguiente periodo</p><p class="text-muted" data-lock-left style="font-size:.85rem"></p></div></div></div>
  <div class="account-block" id="cuenta-monedero"><h2>Monedero</h2><div class="grid grid--2"><div class="card"><span class="eyebrow">Saldo a favor</span><p class="tier-card__price gold-text" style="margin:0">$150</p><p class="text-muted">Crédito interno (nunca efectivo). Úsalo en tu siguiente bloque o en Kulinaria Fit Apparel.</p></div>
    <div class="card"><span class="eyebrow">Kulinaria Store</span><p class="text-muted">Playera oficial, vaso mezclador y la futura línea Fit Apparel.</p><a class="btn btn--outline" style="margin-top:auto;align-self:flex-start" href="#/tienda">Ir a la tienda</a></div></div></div>
  <div class="account-block" id="cuenta-ref"><h2>Mis referidos</h2><div class="panel panel--gold"><span class="eyebrow">Tu código de referencia</span><p class="tier-card__price gold-text" style="margin:0;letter-spacing:.06em">KUL48213</p>
    <p class="text-muted">Recibes $150 MXN de saldo por cada amigo que compre su primer bloque. A los 10 recomendados, bono de $500 MXN.</p>
    <div style="height:10px;border-radius:5px;background:var(--ink-600);overflow:hidden;margin:16px 0"><div style="height:100%;width:30%;background:var(--gold-foil)"></div></div><p class="text-muted" style="margin:0">3 de 10 recomendados con bloques pagados.</p></div></div>
</div></div>""")

PAGES = [("home", "Home", home), ("menu", "Menú", menu), ("ficha", "Ficha", ficha), ("planes", "Planes", planes), ("carta", "Carta", carta),
         ("embajadores", "Embajadores", embajadores), ("tienda", "Store", tienda), ("perfil", "Perfil", perfil), ("carrito", "Carrito", carrito), ("cuenta", "Cuenta", cuenta)]
NAV = [("menu", "Menú"), ("planes", "Planes"), ("carta", "Carta Kulinaria"), ("embajadores", "Embajadores"), ("tienda", "Store"), ("perfil", "Mi perfil")]

pages_html = "".join(f'<div data-page="{k}" hidden>{body}</div>' for k, _, body in PAGES)
nav_html = "".join(f'<a href="#/{k}">{l}</a>' for k, l in NAV)

doc = f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kulinaria MX — Vista previa del sitio</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;1,400;1,500&family=Jost:wght@300;400;500;600&family=Playfair+Display:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>{css}
.preview-bar{{background:#050505;border-bottom:1px solid var(--border);padding:8px 16px;font-size:.75rem;letter-spacing:.08em;color:var(--text-muted);display:flex;gap:16px;flex-wrap:wrap;justify-content:center}}
.preview-bar a{{color:var(--gold-300);text-decoration:underline;text-underline-offset:3px}}
</style></head>
<body>
<div class="preview-bar"><span>VISTA PREVIA estática del tema Shopify · datos de ejemplo</span>
  {''.join(f'<a href="#/{k}">{l}</a>' for k, l, _ in PAGES)}</div>
<div class="announcement">Cierre de pedidos: sábados a las 10:00 AM. <span data-cutoff>· cierra en <strong data-cutoff-value>…</strong></span> · <a href="#/menu">Ver el menú</a></div>
<header class="site-header"><div class="container site-header__inner">
  <a href="#/home" aria-label="Kulinaria">{LOGO}</a>
  <nav class="site-nav" data-nav aria-label="Principal">{nav_html}</nav>
  <div class="header-actions"><a class="icon-link" href="#/cuenta" aria-label="Mi cuenta">{icon('user')}</a>
    <a class="icon-link" href="#/carrito" aria-label="Carrito">{icon('bag')}<span class="cart-count">2</span></a>
    <a class="btn btn--gold" href="#/planes">Elegir mi plan</a>
    <button class="nav-toggle" type="button" data-nav-toggle aria-expanded="false" aria-label="Menú">{icon('menu')}</button></div></div></header>
<main id="main">{pages_html}</main>
<footer class="site-footer"><div class="container"><div class="footer-grid">
  <div>{LOGO}<p class="text-muted" style="margin-top:16px;max-width:34ch">Servicio premium de comida saludable a domicilio, adaptada al estilo de vida de cada cliente.</p>
    <div class="social"><a href="#" aria-label="Instagram">{icon('instagram')}</a><a href="#" aria-label="TikTok">{icon('tiktok')}</a><a href="#" aria-label="WhatsApp">{icon('whatsapp')}</a></div></div>
  <div><h4>Explorar</h4><ul><li><a href="#/menu">Menú semanal</a></li><li><a href="#/planes">Planes</a></li><li><a href="#/carta">Carta Kulinaria</a></li><li><a href="#/tienda">Kulinaria Store</a></li><li><a href="#/embajadores">Embajadores</a></li></ul></div>
  <div><h4>Ayuda</h4><ul><li><a href="#/home">Nosotros</a></li><li><a href="#/home">Filosofía</a></li><li><a href="#/planes">Ayuda y legales</a></li><li><a href="#/perfil">Mi perfil de alergias</a></li></ul></div>
  <div><h4>Contacto</h4><ul><li>+52 000 000 0000</li><li>correo@dominio.com</li><li>WhatsApp</li></ul></div></div>
  <div class="footer-bottom"><span>© 2026 Kulinaria MX. Todos los derechos reservados.</span><span>Pago 100% digital · No se acepta efectivo</span></div></div></footer>
<script>
(function(){{
  var pages=[].slice.call(document.querySelectorAll('[data-page]'));
  function route(){{
    var h=(location.hash||'#/home');
    if(h.indexOf('#/')!==0) return;           // in-page anchors (#cotizacion, #alta, …)
    var k=h.slice(2)||'home';
    var found=false;
    pages.forEach(function(p){{ var on=p.getAttribute('data-page')===k; p.hidden=!on; if(on) found=true; }});
    if(!found){{ pages[0].hidden=false; }}
    window.scrollTo(0,0);
  }}
  window.addEventListener('hashchange',route); route();
}})();
</script>
<script>{js}</script>
</body></html>"""

out = ROOT / "preview" / "index.html"
out.parent.mkdir(exist_ok=True)
out.write_text(doc)
print("wrote", out, f"({len(doc)//1024} KB)")
