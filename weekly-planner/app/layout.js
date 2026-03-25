import './globals.css';

export const metadata = {
  title: 'Weekly Planner',
  description: 'Personal weekly schedule and to-do manager',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
