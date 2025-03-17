const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
const PORT = 5000;

app.use(express.json());

let browser;
let page;
let tokenQueue = []; // Armazena sempre 2 tokens
let isGenerating = false; // Evita múltiplas execuções ao mesmo tempo

// Inicia o Puppeteer e carrega a página
async function startBrowser() {
  try {
    browser = await puppeteer.launch({ headless: true });
    page = await browser.newPage();

    await page.goto("https://pncp.gov.br/app/editais/02056760000146/2025/4", {
      waitUntil: "networkidle2",
    });

    console.log("✅ Página carregada e pronta para gerar tokens.");

    // Garante que a fila começa com 2 tokens prontos
    await generateNewToken();
    await generateNewToken();

    // Inicia o processo automático de renovação
    setInterval(async () => {
      if (tokenQueue.length < 2) {
        await generateNewToken();
      }
    }, 20000);
  } catch (error) {
    console.error("❌ Erro ao iniciar o navegador:", error);
  }
}

// Função para capturar um token novo na página
async function generateNewToken() {
  if (isGenerating) return; // Evita execuções simultâneas
  isGenerating = true;

  try {
    console.log("🔄 Gerando novo token...");

    const token = await page.evaluate(async () => {
      return new Promise((resolve, reject) => {
        if (typeof window.hcaptcha === "undefined") {
          return reject("❌ hcaptcha não disponível");
        }

        window.hcaptcha.execute({ async: true })
          .then(response => {
            if (response && response.response) {
              resolve(response.response);
            } else {
              reject("❌ Erro ao gerar o token");
            }
          })
          .catch(err => reject("❌ Erro ao gerar o token: " + err.message));
      });
    });

    tokenQueue.push(token);

    // Mantém apenas os 2 tokens mais recentes
    if (tokenQueue.length > 2) {
      tokenQueue.shift();
    }

    console.log("✅ Novo token gerado:", token);
  } catch (error) {
    console.error("❌ Erro ao gerar token:", error);
  } finally {
    isGenerating = false; // Libera para a próxima execução
  }
}

// Endpoint para fornecer um token sempre novo
app.get("/api/token", async (req, res) => {
  try {
    if (tokenQueue.length === 0) {
      console.log("⚠️ Nenhum token disponível, gerando um novo...");
      await generateNewToken();
    }

    const token = tokenQueue.shift();

    res.json({ token });

    // Garante que sempre há um token novo pronto
    generateNewToken();
  } catch (error) {
    console.error("❌ Erro ao fornecer token:", error);
    res.status(500).json({ error: "Erro ao fornecer o token" });
  }
});

// Iniciar o servidor Express
app.listen(PORT, async () => {
  try {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
    await startBrowser();
  } catch (error) {
    console.error("❌ Erro ao iniciar o servidor:", error);
  }
});

// Fechar o navegador quando o processo for interrompido
process.on("SIGINT", async () => {
  console.log("🛑 Encerrando o navegador...");
  if (browser) await browser.close();
  process.exit();
});
