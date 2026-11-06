// Unit checks for small Liquid snippets that build links (run: node liquid-snippets-test.mjs)
import { Liquid } from 'liquidjs';
import fs from 'node:fs';
import path from 'node:path';
const src = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '../../snippets/login-url.liquid'), 'utf8');
const engine = new Liquid();
let fail = 0;
const t = async (name, vars, check) => { const out = (await engine.parseAndRender(src, vars)).trim(); const good = check(out); console.log((good ? 'ok   ' : 'FAIL ') + name + (good ? '' : ' :: ' + out)); if (!good) fail++; };
const classic = { account_login_url: '/account/login', account_register_url: '/account/register' };
const modern = { account_login_url: '/customer_authentication/redirect?locale=es&region_country=MX', account_register_url: '/customer_authentication/redirect?locale=es&region_country=MX' };
await t('classic accounts: first parameter starts with ?', { routes: classic, back: '/pages/pedido' }, (o) => o === '/account/login?return_url=%2Fpages%2Fpedido&return_to=%2Fpages%2Fpedido');
await t('new customer accounts: the login address already has a ?, so we join with & (never a second ?)', { routes: modern, back: '/pages/pedido' }, (o) => (o.match(/\?/g) || []).length === 1 && o.includes('region_country=MX&return_url=%2Fpages%2Fpedido'));
await t('create account uses the register address', { routes: classic, kind: 'register', back: '/pages/bienvenida' }, (o) => o.startsWith('/account/register?return_url=%2Fpages%2Fbienvenida'));
await t('without a return page it comes back to the order page', { routes: classic }, (o) => o.includes('return_url=%2Fpages%2Fpedido'));
await t('a path with a query is encoded', { routes: classic, back: '/pages/pedido?dish=x' }, (o) => o.includes('%2Fpages%2Fpedido%3Fdish%3Dx'));
process.exit(fail ? 1 : 0);
