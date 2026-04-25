let file = {};
try { file = require('./config.json'); } catch (_) {}

module.exports = {
  nomeLoja:        process.env.NOME_LOJA        || file.nomeLoja        || 'Quitanda da Família',
  portaBalanca:    process.env.PORTA_BALANCA    || file.portaBalanca    || 'COM3',
  baudRateBalanca: Number(process.env.BAUD_RATE || file.baudRateBalanca || 9600),
  chavePix:        process.env.CHAVE_PIX        || file.chavePix        || '',
  porta:           Number(process.env.PORT      || file.porta           || 3000),
  impressora:      process.env.IMPRESSORA       || file.impressora      || 'EPSON TM-T20X Receipt6',
};
