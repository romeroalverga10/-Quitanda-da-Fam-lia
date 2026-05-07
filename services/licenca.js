const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const CACHE_FILE = path.join(__dirname, '..', 'licenca.dat');
const GRACE_DAYS = 30;       // dias offline permitidos após última validação
const REVALIDA_DAYS = 7;     // revalida online a cada 7 dias

let _statusCache = null;     // cache em memória para evitar I/O a cada request

function getServidor() {
  try {
    const c = require('../config');
    return c.licencaServidor || process.env.LICENCA_SERVER || 'https://licencas.quitandapdv.com.br';
  } catch { return process.env.LICENCA_SERVER || 'https://licencas.quitandapdv.com.br'; }
}

function lerDisco() {
  try {
    const raw = fs.readFileSync(CACHE_FILE, 'utf8').trim();
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  } catch { return null; }
}

function salvarDisco(dados) {
  const json = JSON.stringify(dados);
  fs.writeFileSync(CACHE_FILE, Buffer.from(json).toString('base64'), 'utf8');
}

function chamarServidor(path, body) {
  return new Promise(resolve => {
    const servidor = getServidor();
    const bodyStr = JSON.stringify(body);
    const url = new URL(servidor + path);
    const mod = url.protocol === 'https:' ? https : http;
    const opts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
      rejectUnauthorized: false,
      timeout: 8000,
    };
    const req = mod.request(opts, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ ok: false, motivo: 'resposta_invalida' }); }
      });
    });
    req.on('error', () => resolve({ ok: false, offline: true }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, offline: true }); });
    req.write(bodyStr);
    req.end();
  });
}

async function verificarLicenca(forcarOnline = false) {
  // Usa cache em memória se recente (< 1 min)
  if (_statusCache && !forcarOnline && (Date.now() - _statusCache.ts) < 60000) {
    return _statusCache.resultado;
  }

  const cache = lerDisco();
  const agora = Date.now();

  if (!cache || !cache.chave || !cache.cnpj) {
    return set({ ok: false, motivo: 'nao_ativado' });
  }

  // Verifica validade da licença (data de expiração já conhecida)
  if (cache.validade && new Date(cache.validade + 'T23:59:59') < new Date()) {
    return set({ ok: false, motivo: 'expirado', validade: cache.validade, cnpj: cache.cnpj });
  }

  const diasDesde = cache.ultimaValidacao
    ? (agora - cache.ultimaValidacao) / 86400000
    : 999;

  // Cache ainda válido — não precisa chamar servidor
  if (!forcarOnline && diasDesde < REVALIDA_DAYS) {
    return set({ ok: true, cnpj: cache.cnpj, validade: cache.validade, plano: cache.plano });
  }

  // Tenta validar online
  const resp = await chamarServidor('/api/validar', { chave: cache.chave, cnpj: cache.cnpj });

  if (resp.ok) {
    salvarDisco({ ...cache, ultimaValidacao: agora, validade: resp.validade, plano: resp.plano });
    return set({ ok: true, cnpj: cache.cnpj, validade: resp.validade, plano: resp.plano });
  }

  if (resp.offline) {
    // Sem internet — grace period
    if (diasDesde < GRACE_DAYS) {
      const diasRestantes = Math.floor(GRACE_DAYS - diasDesde);
      return set({ ok: true, cnpj: cache.cnpj, validade: cache.validade, plano: cache.plano,
        aviso: `Sem conexão com servidor de licenças. ${diasRestantes} dia(s) restante(s) offline.` });
    }
    return set({ ok: false, motivo: 'offline_excedido', cnpj: cache.cnpj });
  }

  // Servidor rejeitou (revogada, CNPJ errado, etc.)
  return set({ ok: false, motivo: resp.motivo || 'rejeitado', cnpj: cache.cnpj });
}

async function ativarLicenca(chave, cnpj) {
  const resp = await chamarServidor('/api/ativar', { chave: chave.trim().toUpperCase(), cnpj: cnpj.replace(/\D/g, '') });
  if (resp.ok) {
    salvarDisco({ chave: chave.trim().toUpperCase(), cnpj: cnpj.replace(/\D/g, ''),
      ultimaValidacao: Date.now(), validade: resp.validade, plano: resp.plano });
    _statusCache = null;
  }
  return resp;
}

function set(resultado) {
  _statusCache = { ts: Date.now(), resultado };
  return resultado;
}

function limparCache() { _statusCache = null; }

module.exports = { verificarLicenca, ativarLicenca, limparCache };
