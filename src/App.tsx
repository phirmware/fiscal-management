import { useAppStore } from "./app/store.js";
import { useTheme } from "./app/useTheme.js";
import { AppShell } from "./components/AppShell.js";
import { BudgetScreen } from "./screens/Budget.js";
import { FirstRunWizard } from "./screens/FirstRunWizard.js";
import { HomeScreen } from "./screens/Home.js";
import { InsightsScreen } from "./screens/Insights.js";
import { SettingsScreen } from "./screens/Settings.js";
import { TransactionsScreen } from "./screens/Transactions.js";

export function App() {
  useTheme();
  const screen = useAppStore((s) => s.selectedScreen);
  const hasOnboarded = useAppStore((s) => s.ui.hasOnboarded);
  const hasAnyData = useAppStore(
    (s) => s.budget.categories.length > 0 || s.budget.income.length > 0,
  );

  if (!hasOnboarded && !hasAnyData) {
    return <FirstRunWizard />;
  }

  return (
    <AppShell>
      {screen === "home" && <HomeScreen />}
      {screen === "budget" && <BudgetScreen />}
      {screen === "transactions" && <TransactionsScreen />}
      {screen === "insights" && <InsightsScreen />}
      {screen === "settings" && <SettingsScreen />}
    </AppShell>
  );
}
