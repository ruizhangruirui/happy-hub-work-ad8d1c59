import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export default function OperationsCharts({
  employmentTitle,
  teamTitle,
  trendTitle,
  employment,
  teams,
  trend,
}: {
  employmentTitle: string;
  teamTitle: string;
  trendTitle: string;
  employment: Array<{ name: string; value: number }>;
  teams: Array<{ name: string; value: number }>;
  trend: Array<{ month: string; joined: number; left: number }>;
}) {
  return (
    <>
      <div className="dashboard analyticsgrid">
        <DistributionChart title={employmentTitle} data={employment} color="#4968db" />
        <DistributionChart title={teamTitle} data={teams} color="#4f9b78" />
      </div>
      <section className="panel analyticstrend">
        <div className="panelhead">
          <b>{trendTitle}</b>
        </div>
        <div className="analyticschart analyticscharttrend">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Line dataKey="joined" stroke="#4968db" />
              <Line dataKey="left" stroke="#d56a63" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </>
  );
}

function DistributionChart({
  title,
  data,
  color,
}: {
  title: string;
  data: Array<{ name: string; value: number }>;
  color: string;
}) {
  return (
    <section className="panel">
      <div className="panelhead">
        <b>{title}</b>
      </div>
      <div className="analyticschart analyticschartdistribution">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="value" fill={color} radius={[5, 5, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
