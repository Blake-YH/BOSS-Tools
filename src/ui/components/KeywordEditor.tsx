import { Plus, X } from 'lucide-react'

type KeywordEditorProps = {
  label: string
  description: string
  tone: 'include' | 'exclude'
  keywords: string[]
  locked: boolean
  onChange: (keywords: string[]) => void
}

export const KeywordEditor = ({
  label,
  description,
  tone,
  keywords,
  locked,
  onChange
}: KeywordEditorProps): React.JSX.Element => {
  const addKeyword = (): void => onChange([...keywords, ''])
  const updateKeyword = (index: number, value: string): void => {
    const next = [...keywords]
    next[index] = value
    onChange(next)
  }

  return (
    <section className={`keyword-editor ${tone}`} aria-labelledby={`${tone}-keywords-title`}>
      <div className="keyword-heading">
        <div>
          <h3 id={`${tone}-keywords-title`}>{label}</h3>
          <p>{description}</p>
        </div>
        <button className="icon-button" disabled={locked} type="button" title={`添加${label}`} onClick={addKeyword}>
          <Plus size={16} aria-hidden="true" />
          <span className="sr-only">添加{label}</span>
        </button>
      </div>
      <div className="keyword-list">
        {keywords.length === 0 ? (
          <button className="empty-keywords" disabled={locked} type="button" onClick={addKeyword}>
            <Plus size={15} aria-hidden="true" /> 添加{label}
          </button>
        ) : (
          keywords.map((keyword, index) => (
            <div className="keyword-row" key={`${tone}-${index}`}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <input
                aria-label={`${label} ${index + 1}`}
                disabled={locked}
                placeholder={tone === 'include' ? '例如：嵌入式软件开发' : '例如：外包'}
                value={keyword}
                onChange={(event) => updateKeyword(index, event.target.value)}
              />
              <button
                className="icon-button"
                disabled={locked}
                type="button"
                title={`删除${label}`}
                onClick={() => onChange(keywords.filter((_, itemIndex) => itemIndex !== index))}
              >
                <X size={15} aria-hidden="true" />
                <span className="sr-only">删除词条</span>
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
