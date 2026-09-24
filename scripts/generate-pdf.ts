import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

function generatePDF() {
  const outputPath = path.resolve(process.cwd(), 'public', 'ImportarPDF.pdf');
  const rootOutputPath = path.resolve(process.cwd(), 'ImportarPDF.pdf');

  // Criar documento PDF com margens limpas
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
    info: {
      Title: 'Relatório Técnico: Procedimento de Importação de PDF no CVFacil.NG',
      Author: 'Engenharia de Software CVFacil.NG',
      Subject: 'Documentação Técnica de Importação de PDF',
      Keywords: 'CVFacil, PDF, Importação, IA, Gemini, Relatório'
    }
  });

  const writeStreamPublic = fs.createWriteStream(outputPath);
  doc.pipe(writeStreamPublic);

  // Paleta de Cores Profissional
  const primaryColor = '#0F5132';     // Verde Floresta Profundo
  const secondaryColor = '#198754';   // Verde Médio
  const darkColor = '#1E293B';        // Cinza Escuro Texto
  const mutedColor = '#64748B';       // Cinza Neutro Metadados
  const lightBg = '#F8FAFC';          // Fundo suave de cards
  const borderColor = '#E2E8F0';      // Borda sutil

  // Cabeçalho Principal
  doc.rect(50, 45, 495, 4).fill(primaryColor);
  doc.moveDown(1.5);

  doc
    .font('Helvetica-Bold')
    .fontSize(20)
    .fillColor(primaryColor)
    .text('CVFacil.NG — Relatório Técnico Oficial', { align: 'left' });

  doc
    .font('Helvetica')
    .fontSize(13)
    .fillColor(darkColor)
    .text('Procedimento de Importação de Currículo em PDF', { align: 'left' });

  doc
    .fontSize(9)
    .fillColor(mutedColor)
    .text(`Data de Emissão: 18 de Setembro de 2026 | Versão da Aplicação: 1.0.0`, { align: 'left' });

  doc.moveDown(1.2);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(borderColor).stroke();
  doc.moveDown(1.2);

  // Função utilitária para títulos de seção
  function addSectionTitle(title: string) {
    if (doc.y > 680) doc.addPage();
    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(12).fillColor(primaryColor).text(title);
    doc.moveDown(0.4);
  }

  function addSubTitle(subTitle: string) {
    if (doc.y > 700) doc.addPage();
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(secondaryColor).text(subTitle);
    doc.moveDown(0.2);
  }

  function addParagraph(text: string) {
    if (doc.y > 720) doc.addPage();
    doc.font('Helvetica').fontSize(9.5).fillColor(darkColor).text(text, {
      align: 'justify',
      lineGap: 3
    });
    doc.moveDown(0.4);
  }

  function addBullet(bulletTitle: string, bulletText: string) {
    if (doc.y > 720) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(darkColor).text(`•  ${bulletTitle}: `, {
      continued: true,
      lineGap: 3
    });
    doc.font('Helvetica').fillColor(darkColor).text(bulletText, {
      align: 'justify',
      lineGap: 3
    });
    doc.moveDown(0.2);
  }

  // Seção 1
  addSectionTitle('1. Visão Geral da Funcionalidade');
  addParagraph(
    'A funcionalidade de Importação de PDF do CVFacil.NG permite que candidatos e administradores carreguem um currículo existente no formato PDF e o convertam de forma automatizada em um currículo digital estruturado e pronto para edição. O motor do aplicativo analisa o documento, extrai todo o conteúdo semântico, identifica as seções lógicas (dados pessoais, resumo profissional, histórico de trabalho, formação acadêmica, competências e idiomas) e popula os campos visuais em tempo real, eliminando totalmente a necessidade de digitação manual.'
  );

  // Seção 2
  addSectionTitle('2. Pré-requisitos para Utilização');
  addBullet('Formato do Arquivo', 'O documento deve ser obrigatoriamente um arquivo com extensão .pdf válida (arquivos .docx, imagens estáticas isoladas ou links externos não são processados nesta rota).');
  addBullet('Camada de Texto Digital', 'O arquivo deve conter texto selecionável digital (gerado em ferramentas como Word, Google Docs, Canva ou LinkedIn). Documentos digitalizados por foto sem camada de OCR prévia podem apresentar taxa reduzida de extração.');
  addBullet('Integridade do Arquivo', 'O PDF não pode estar corrompido, protegido por senha de leitura ou criptografia com restrição de cópia.');
  addBullet('Limite de Tamanho', 'Recomenda-se arquivos de até 10 MB para evitar estouro de memória e encerramento prematuro por timeout da requisição HTTP.');
  addBullet('Configuração de Ambiente', 'A chave de processamento de inteligência artificial (GEMINI_API_KEY) deve estar declarada nas variáveis de ambiente do servidor.');

  // Seção 3
  addSectionTitle('3. Passo a Passo Completo do Procedimento');
  addSubTitle('Opção A: Através do Editor de Currículos (ResumeEditor)');
  addParagraph('1. Acesse o menu do sistema e abra o Editor de Currículos.');
  addParagraph('2. Na barra de ferramentas superior, clique no botão "Importar PDF" (ícone de upload).');
  addParagraph('3. Na janela do sistema operacional, escolha o arquivo PDF desejado.');
  addParagraph('4. Aguarde a validação local e o processamento seguro em segundo plano.');
  addParagraph('5. Os campos das seções Informações Básicas, Experiências, Educação, Habilidades e Idiomas são preenchidos instantaneamente para revisão.');

  addSubTitle('Opção B: Pelo Painel Principal do Usuário (Dashboard)');
  addParagraph('1. No painel de controle, clique no card de ação rápida "Importar Currículo em PDF".');
  addParagraph('2. Selecione o arquivo do currículo no computador ou dispositivo.');
  addParagraph('3. O sistema cria automaticamente um novo currículo vinculado à conta do usuário com os dados extraídos.');

  // Seção 4
  addSectionTitle('4. Descrição Técnica das Etapas e Finalidade');
  addBullet('Etapa 1 - Validação Estrutural (pdfjs-dist)', 'Valida os cabeçalhos, número de páginas e integridade binária do PDF com timeout de 15 segundos para evitar travamentos.');
  addBullet('Etapa 2 - Codificação em Base64', 'Converte os bytes do documento em DataURL padronizada para transporte seguro em payload JSON.');
  addBullet('Etapa 3 - Extração Semântica (/api/gemini/import-pdf)', 'O modelo multimodal Gemini 3.5 Flash recebe o documento e extrai as entidades via Structured Outputs seguindo um contrato rígido de tipagem (FullName, Summary, Experiences, Education, Skills, Languages).');
  addBullet('Etapa 4 - Camada de Resiliência (Fallback)', 'Caso o endpoint de backend enfrente interrupção de conectividade, a rotina aciona o módulo cliente de contingência mantendo o sistema em funcionamento.');
  addBullet('Etapa 5 - Mapeamento de UUIDs e Hidratação de Estado', 'Gera identificadores únicos para cada experiência e curso importado, mescla o avatar ativo do usuário e preserva o template visual selecionado.');

  // Seção 5
  addSectionTitle('5. Possíveis Erros, Limitações e Ações de Mitigação');
  addBullet('TIMEOUT_PDF / Demora Excessiva', 'Ocorre quando o PDF possui muitas páginas (acima de 10) ou vetores pesados. Mitigação: usar currículos de 1 a 3 páginas.');
  addBullet('Arquivo Inválido ou Danificado', 'Ocorre em arquivos com extensão alterada manualmente. Mitigação: exportar novamente o documento no Word/Docs.');
  addBullet('Campos Ausentes ou Vazios', 'Ocorre em PDFs puramente escaneados como imagem. Mitigação: aplicar OCR prévio ou utilizar a versão original em texto.');
  addBullet('Chave de API Inexistente', 'Ocorre caso a GEMINI_API_KEY não esteja configurada no servidor. Mitigação: preencher a variável no arquivo .env.');

  // Seção 6
  addSectionTitle('6. Boas Práticas Operacionais');
  addParagraph('• Priorize sempre exportações diretas do Word ou Google Docs ("Salvar como PDF").');
  addParagraph('• Mantenha uma estrutura padrão de seções (Cabeçalho, Experiências, Formação, Habilidades) para máxima precisão da IA.');
  addParagraph('• Revise os dados importados antes de gerar a versão final para download ou impressão.');

  // Seção 7
  addSectionTitle('7. Considerações Finais');
  addParagraph(
    'O módulo de importação de PDF do CVFacil.NG combina eficiência computacional com inteligência artificial de última geração. O pipeline é protegido contra travamentos de interface, efetua limpeza automática de buffers e respeita a arquitetura visual dos templates sem alterar as landing pages ou regras fundamentais do aplicativo.'
  );

  doc.moveDown(1);
  doc.rect(50, doc.y, 495, 20).fill(lightBg);
  doc
    .font('Helvetica-Bold')
    .fontSize(8.5)
    .fillColor(primaryColor)
    .text('Documento gerado automaticamente pelo sistema CVFacil.NG — Todos os direitos reservados.', 55, doc.y - 14, {
      align: 'center'
    });

  doc.end();

  writeStreamPublic.on('finish', () => {
    // Também copiar para a raiz caso o usuário deseje acessar diretamente
    try {
      fs.copyFileSync(outputPath, rootOutputPath);
    } catch (e) {
      console.error('Erro ao copiar para raiz:', e);
    }
    console.log('PDF gerado com sucesso em:', outputPath);
  });
}

generatePDF();
