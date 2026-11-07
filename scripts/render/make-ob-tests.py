"""Builds test-ob.mjs: the shared setup of test.mjs plus only the onboarding blocks (v69 gate, v22 questionnaire, v27 new/existing account)."""
s = open('/home/user/Kulinaria-MX/scripts/render/test.mjs', encoding='utf8').read()
a = s.index('// ---- every page: renders')
head = s[:a]
b1 = s.index('// =====================================================================  v69')
e1 = s.index('// =====================================================================', s.index('v22: onboarding questionnaire') + 10)
b2 = s.index('// =====================================================================  v27')
e2 = s.index('// =====================================================================', b2 + 10)
open('/home/user/Kulinaria-MX/scripts/render/test-ob.mjs', 'w', encoding='utf8').write(head + "\nawait page.goto(URL0);\n" + s[b1:e1] + "\n" + s[b2:e2] + "\nawait browser.close();\nconsole.log(fail.length ? fail.length + ' failed' : 'all onboarding checks passed');\n")
print('built')
