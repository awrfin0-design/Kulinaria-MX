"""Builds test-new.mjs: the shared setup of test.mjs plus only the newest test blocks (v49 and later), so they can run on their own and fast."""
import re
s = open('/home/user/Kulinaria-MX/scripts/render/test.mjs', encoding='utf8').read()
a = s.index('// ---- every page: renders')
b = s.index('// =====================================================================  v49')
c = s.index('await browser.close();', b)
head = s[:a]
blocks = s[b:c]
open('/home/user/Kulinaria-MX/scripts/render/test-new.mjs', 'w', encoding='utf8').write(head + "\nawait page.goto(URL0); await page.evaluate(() => { localStorage.setItem('kx-test-orders', '0'); sessionStorage.setItem('kx_ob_asked', '1'); });\n" + blocks + "\nawait browser.close();\nconsole.log(fail.length ? fail.length + ' failed' : 'all new checks passed');\n")
print('built', len(blocks) // 1024, 'KB of newest blocks')
