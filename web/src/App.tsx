import { HealthBadge } from "./components/HealthBadge.js";

export function App() {
  return (
    <div>
      <h1>CoinGecko Paper Exchange</h1>
      <footer>
        <HealthBadge />
        <a href="https://www.coingecko.com" target="_blank" rel="noopener noreferrer">
          Powered by CoinGecko
        </a>
      </footer>
    </div>
  );
}

export default App;
