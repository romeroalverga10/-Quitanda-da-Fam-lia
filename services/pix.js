const QRCode = require('qrcode');
const config = require('../config');

function gerarPayloadPix(chave, valor, nomeBeneficiario, cidade) {
  const valorStr = Number(valor).toFixed(2);
  const nome = (nomeBeneficiario || 'QUITANDA').substring(0, 25).toUpperCase().padEnd(25, ' ').trim();
  const cid = (cidade || 'BRASIL').substring(0, 15).toUpperCase();

  function campo(id, valor) {
    const len = String(valor.length).padStart(2, '0');
    return `${id}${len}${valor}`;
  }

  const merchantAccountInfo = campo('00', 'BR.GOV.BCB.PIX') + campo('01', chave);
  const payload =
    campo('00', '01') +
    campo('26', merchantAccountInfo) +
    campo('52', '0000') +
    campo('53', '986') +
    campo('54', valorStr) +
    campo('58', 'BR') +
    campo('59', nome) +
    campo('60', cid) +
    campo('62', campo('05', '***'));

  const crc = calcularCRC16(payload + '6304');
  return payload + '6304' + crc;
}

function calcularCRC16(payload) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1;
    }
  }
  return ((crc & 0xffff).toString(16).toUpperCase()).padStart(4, '0');
}

async function gerarQRCode(valor) {
  const chave = config.chavePix || '';
  const payload = gerarPayloadPix(chave, valor, 'Quitanda da Família', 'Brasil');
  const dataUrl = await QRCode.toDataURL(payload, { width: 256, margin: 2 });
  return { dataUrl, chave, valor, payload };
}

module.exports = { gerarQRCode };
