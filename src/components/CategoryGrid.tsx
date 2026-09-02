import { Link } from 'react-router-dom'
import { categories, colorClasses } from '../data/categories'

export default function CategoryGrid() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      {categories.map((cat) => {
        const colors = colorClasses[cat.color]
        return (
          <Link
            key={cat.id}
            to={`/category/${cat.id}`}
            className="flex flex-col items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-transparent hover:shadow-lg hover:shadow-slate-200 lg:items-center lg:p-6 lg:text-center"
          >
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-xl text-white ${colors.bg} lg:h-12 lg:w-12`}
            >
              <cat.icon size={20} />
            </span>
            <span>
              <span className="block text-sm font-semibold text-slate-800 lg:text-base">
                {cat.title}
              </span>
              <span className="mt-0.5 block text-xs text-slate-400">{cat.subtitle}</span>
            </span>
          </Link>
        )
      })}
    </div>
  )
}
