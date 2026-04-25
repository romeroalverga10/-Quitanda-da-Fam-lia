let SerialPort;
try { SerialPort = require('serialport').SerialPort; } catch (_) {}
const config = require('../config');

const STX = 0x02;
const ETX = 0x03;
const ENQ = 0x05;

let port = null;
let buffer = Buffer.alloc(0);
let pesoAtual = null;

function parsePeso(buf) {
  // Protocolo: STX + 5 bytes peso (ASCII, gramas) + ETX
  const stx = buf.indexOf(STX);
  const etx = buf.indexOf(ETX, stx);
  if (stx === -1 || etx === -1 || etx <= stx) return null;
  const campo = buf.slice(stx + 1, etx).toString('ascii').trim();
  const gramas = parseInt(campo, 10);
  if (isNaN(gramas)) return null;
  return gramas / 1000; // converte para kg
}

function iniciarBalanca() {
  if (!SerialPort) {
    console.warn('SerialPort não disponível — balança desativada.');
    return;
  }
  try {
    port = new SerialPort({
      path: config.portaBalanca || 'COM3',
      baudRate: config.baudRateBalanca || 9600,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      autoOpen: false
    });

    port.open((err) => {
      if (err) {
        console.warn(`Balança não conectada em ${config.portaBalanca}: ${err.message}`);
        return;
      }
      console.log(`Balança conectada em ${config.portaBalanca}`);
    });

    port.on('data', (data) => {
      buffer = Buffer.concat([buffer, data]);
      const peso = parsePeso(buffer);
      if (peso !== null) {
        pesoAtual = peso;
        // descarta bytes já processados
        const etx = buffer.indexOf(ETX);
        buffer = buffer.slice(etx + 1);
      }
      // evita buffer crescer indefinidamente
      if (buffer.length > 64) buffer = Buffer.alloc(0);
    });

    port.on('error', (err) => {
      console.warn('Erro na balança:', err.message);
    });
  } catch (err) {
    console.warn('Falha ao inicializar balança:', err.message);
  }
}

function lerPeso() {
  return new Promise((resolve, reject) => {
    if (!port || !port.isOpen) {
      return reject(new Error('Balança não conectada'));
    }

    pesoAtual = null;
    buffer = Buffer.alloc(0);

    const timeout = setTimeout(() => {
      clearInterval(poll);
      reject(new Error('Tempo esgotado aguardando leitura da balança'));
    }, 5000);

    // Envia ENQ para solicitar peso
    const poll = setInterval(() => {
      port.write(Buffer.from([ENQ]), (err) => {
        if (err) console.warn('Erro ao enviar ENQ:', err.message);
      });
    }, 300);

    const check = setInterval(() => {
      if (pesoAtual !== null) {
        clearTimeout(timeout);
        clearInterval(poll);
        clearInterval(check);
        resolve(pesoAtual);
      }
    }, 100);
  });
}

module.exports = { iniciarBalanca, lerPeso };
