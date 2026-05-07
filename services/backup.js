const fs = require('fs');
const path = require('path');

const BACKUP_DIR = path.join(__dirname, '..', 'backups', 'xmls');

function pastaMes() {
  const agora = new Date();
  const mes = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
  const pasta = path.join(BACKUP_DIR, mes);
  if (!fs.existsSync(pasta)) fs.mkdirSync(pasta, { recursive: true });
  return pasta;
}

function salvarXmlNfe(chave, xmlAssinado, xmlRetorno) {
  try {
    const pasta = pastaMes();
    fs.writeFileSync(path.join(pasta, `NFe${chave}.xml`), xmlAssinado, 'utf8');
    if (xmlRetorno) {
      fs.writeFileSync(path.join(pasta, `NFe${chave}-prot.xml`), xmlRetorno, 'utf8');
    }
  } catch (err) {
    console.error('[BACKUP] Erro ao salvar NFe:', err.message);
  }
}

function salvarXmlCancelamento(chave, xmlEvento) {
  try {
    const pasta = pastaMes();
    fs.writeFileSync(path.join(pasta, `Canc_NFe${chave}.xml`), xmlEvento, 'utf8');
  } catch (err) {
    console.error('[BACKUP] Erro ao salvar cancelamento:', err.message);
  }
}

function exportarTodos(db) {
  const lista = db.all(`SELECT chave, xml_assinado, xml_retorno, status FROM nfce WHERE xml_assinado IS NOT NULL`);
  let salvos = 0;
  for (const n of lista) {
    try {
      const pasta = pastaMes();
      if (n.xml_assinado) {
        const arquivo = path.join(pasta, `NFe${n.chave}.xml`);
        if (!fs.existsSync(arquivo)) {
          fs.writeFileSync(arquivo, n.xml_assinado, 'utf8');
          salvos++;
        }
      }
      if (n.xml_retorno) {
        const arquivo = path.join(pasta, `NFe${n.chave}-prot.xml`);
        if (!fs.existsSync(arquivo)) {
          fs.writeFileSync(arquivo, n.xml_retorno, 'utf8');
        }
      }
    } catch {}
  }
  return { total: lista.length, salvos };
}

module.exports = { salvarXmlNfe, salvarXmlCancelamento, exportarTodos };
