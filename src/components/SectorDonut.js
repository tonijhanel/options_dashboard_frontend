import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// Pastel palette matching the reference dashboard's sector donut
const COLORS = ['#5ba3b0', '#e8b86d', '#e08e6d', '#b399d4', '#8fbc74', '#7a9fd4', '#d47a9f'];

export default function SectorDonut({ data }) {
  return (
    <ResponsiveContainer width="100%" height={360}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={70}
          outerRadius={140}
          paddingAngle={1}
          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
        >
          {data.map((entry, i) => (
            <Cell key={entry.name} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}