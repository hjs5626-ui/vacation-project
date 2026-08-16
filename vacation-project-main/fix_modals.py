import re

with open('public/js/modals.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the accidental reload in update diary
content = content.replace('renderEntries();\n    window.location.reload();\n  } else {\n    const entry = {\n      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),\n      type: \'diary\',',
                          'renderEntries();\n  } else {\n    const entry = {\n      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),\n      type: \'diary\',')

# In createFile
content = content.replace('    renderEntries();\n  }\n\n  /* ── Create / Update Diary',
                          '    renderEntries();\n    window.location.reload();\n  }\n\n  /* ── Create / Update Diary')

# In createDiary
content = content.replace('      openBookEditor(entry);\n      showToast(`Diary "${title}" created`);\n      window.location.reload();\n  }\n}',
                          '      openBookEditor(entry);\n      showToast(`Diary "${title}" created`);\n      setTimeout(() => window.location.reload(), 100);\n  }\n}')

content = content.replace('      openBookEditor(entry);\n      showToast(`Diary "${title}" created`);\n  }\n}',
                          '      openBookEditor(entry);\n      showToast(`Diary "${title}" created`);\n      setTimeout(() => window.location.reload(), 100);\n  }\n}')

# Wait, let me just add location.reload() reliably to both by searching for the function endings.
# createFile ending:
content = re.sub(r'    renderEntries\(\);\n}', r'    renderEntries();\n    setTimeout(() => window.location.reload(), 100);\n}', content)


with open('public/js/modals.js', 'w', encoding='utf-8') as f:
    f.write(content)
