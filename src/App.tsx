import { useAppStore } from "./app/store.js";
import { AppShell } from "./components/AppShell.js";
import { BudgetScreen } from "./screens/Budget.js";
import { HomeScreen } from "./screens/Home.js";
import { SettingsScreen } from "./screens/Settings.js";
import { TransactionsScreen } from "./screens/Transactions.js";

export function App() {
  const screen = useAppStore((s) => s.selectedScreen);
  return (
    <AppShell>
      {screen === "home" && <HomeScreen />}
      {screen === "budget" && <BudgetScreen />}
      {screen === "transactions" && <TransactionsScreen />}
      {screen === "settings" && <SettingsScreen />}
    </AppShell>
  );
}
