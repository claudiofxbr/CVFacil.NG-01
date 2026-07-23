# Guia de Migração - CVFacil.NG para Hostinger

Este documento detalha a abordagem técnica para hospedar o aplicativo CVFacil.NG na infraestrutura da Hostinger.

## 1. Arquitetura do Aplicativo
O CVFacil.NG opera como uma **Single Page Application (SPA)** estática.
- **Dados:** Persistidos no navegador do usuário (`localStorage`).
- **Dependências:** Carregadas via CDN ou empacotadas no build.
- **Custo:** Baixo (funciona em planos "Single Web Hosting" ou superiores).

## 2. Preparação (Build)
Antes de enviar para a Hostinger, o código React/TypeScript (`.tsx`) precisa ser convertido para HTML/CSS/JS que os navegadores entendem.

1. No seu terminal local (onde o projeto está), execute:
   ```bash
   npm run build
   ```
   *Isso criará uma pasta chamada `build` ou `dist` na raiz do projeto.*

2. Verifique o conteúdo desta pasta. Ela deve conter:
   - `index.html`
   - Uma pasta `assets` ou `static` (com arquivos .js e .css).
   - O arquivo `.htaccess` (veja a seção 4).

## 3. Upload para a Hostinger

1. Acesse o **hPanel** da Hostinger.
2. Vá para **Gerenciador de Arquivos** (File Manager).
3. Navegue até a pasta **`public_html`**.
4. **Importante:** Apague qualquer arquivo `default.php` que estiver lá.
5. Faça o upload de **todo o conteúdo** de dentro da sua pasta `build` ou `dist` gerada no passo anterior.
   - *Nota:* Não suba a pasta `build` inteira, suba os arquivos que estão *dentro* dela para a raiz do `public_html`.

## 4. Configuração do Servidor (.htaccess)
O arquivo `.htaccess` incluído no projeto é vital. Ele informa ao servidor da Hostinger que todas as requisições devem ser gerenciadas pelo `index.html` do React. Certifique-se de que este arquivo esteja na pasta `public_html` junto com os outros.

## 5. Variáveis de Ambiente
Como identificado na análise, este projeto **não requer** configuração de variáveis de ambiente no painel da Hostinger, pois não utiliza chaves de API de backend (como Firebase ou AWS) neste momento.

## 6. Solução de Problemas Comuns

- **Tela Branca:** Geralmente causado por caminhos de arquivo errados. Verifique se o `index.html` está carregando os scripts corretamente.
- **Erro 404 ao recarregar:** Significa que o arquivo `.htaccess` está faltando ou mal configurado.
- **Imagens quebradas:** Certifique-se de que a pasta de imagens foi enviada junto com o build.
