import { Card, CardHeader, CardContent } from '../ui/Card'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'

const data = [
  { name: 'CGST', value: 45, color: '#FF6B35' },
  { name: 'SGST', value: 45, color: '#004E89' },
  { name: 'IGST', value: 10, color: '#10B981' },
]

function TaxBreakdown() {
  return (
    <Card>
      <CardHeader title="Tax breakdown" subtitle="Current period" />
      <CardContent className="pb-4">
        <div className="h-44 min-h-[176px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
              <Pie
                data={data}
                cx="50%"
                cy="45%"
                innerRadius={44}
                outerRadius={60}
                paddingAngle={2}
                dataKey="value"
              >
                {data.map((entry, i) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: 8 }}
                formatter={(value) => [`${value}%`, 'Share']}
              />
              <Legend
                layout="horizontal"
                align="center"
                verticalAlign="bottom"
                wrapperStyle={{ paddingTop: 8 }}
                formatter={(value, entry) => `${value} ${entry?.payload?.value ?? 0}%`}
                iconType="square"
                iconSize={10}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

export default TaxBreakdown
