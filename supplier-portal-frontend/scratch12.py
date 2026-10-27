def sub(p, pairs):
    s = open(p, encoding='utf-8').read()
    for a, b in pairs:
        assert a in s, (p, a[:60])
        s = s.replace(a, b, 1)
    open(p, 'w', encoding='utf-8').write(s)

sub('src/styles/index.css', [("  .app-field::placeholder", "  .sig-pop { animation: sig-pop 220ms ease-out; }\n  @keyframes sig-pop { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }\n  .app-field::placeholder")])

p = 'src/components/agreement/AgreementSignPanel.jsx'
s = open(p, encoding='utf-8').read()
def r(a, b):
    global s
    assert a in s, a[:60]
    s = s.replace(a, b, 1)
r('''    <div className="mx-auto w-full max-w-3xl space-y-3 pb-4">
      <AgreementSummaryCard''', '''    <div className="mx-auto w-full max-w-3xl pb-4 xl:flex xl:max-w-[980px] xl:items-start xl:gap-5">
      <div className="min-w-0 flex-1 space-y-3">
      <AgreementSummaryCard''')
r('''          <Button variant="secondary" className={SMALL_BUTTON} onClick={() => onStale?.()}><RefreshCw size={15} /> Refresh</Button>
        </div>
      )}
    </div>
  )

  // `fill`''', '''          <Button variant="secondary" className={SMALL_BUTTON} onClick={() => onStale?.()}><RefreshCw size={15} /> Refresh</Button>
        </div>
      )}
      </div>

      <div className="sticky top-0 hidden w-[340px] shrink-0 xl:block">
        <SignaturePreview agreement={agreement} vendorName={vendorName} name={name} designation={designation} signature={signature} verified={verified} />
      </div>
    </div>
  )

  // `fill`''')
r('<div className="mx-auto flex w-full max-w-3xl flex-col gap-2 py-2.5', '<div className="mx-auto flex w-full max-w-3xl flex-col gap-2 py-2.5 xl:max-w-[980px]')
r("import AgreementSummaryCard from './AgreementSummaryCard'", "import AgreementSummaryCard from './AgreementSummaryCard'\nimport SignaturePreview from './SignaturePreview'")
open(p, 'w', encoding='utf-8').write(s)
print('ok')
