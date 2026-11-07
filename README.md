# Há homem ou mulher pra mim no Brasil?

Calculadora do “pool afetivo” brasileiro: mostra **em valores absolutos e relativos quantas
pessoas atendem simultaneamente aos critérios que você escolher**, usando microdados públicos do
IBGE. A conta fica aberta — cada número tem fonte, método e validação. E, quando o resultado é
raro, o card compartilhável sai com meme incluso.

> Inspirado na ideia do [Delusion Meter](https://delusionmeter.com), mas construído do zero para o
> Brasil, com dados auditáveis e sem multiplicar percentuais como se os atributos fossem
> independentes.

## O que o site responde

- Quantas pessoas (e qual percentual) de 20 a 79 anos, no Brasil ou em uma UF, têm:
  idade, altura mínima, renda mínima, escolaridade, estado civil, ausência de filhos, IMC,
  tabagismo, carro no domicílio, casa própria e cor/raça.
- O número atualiza automaticamente conforme você mexe nos filtros — sem clique.
- Qual é a raridade da combinação (“1 em X”) e uma margem de erro aproximada.
- Qual filtro mais reduz o pool e quanto ele cresceria se você abrisse mão de um critério.
- Onde estão essas pessoas (por UF) e como o pool se distribui por idade.
- Um **card compartilhável em PNG** com o veredito. Se o pool for pequeno (≤ 1% do grupo ou
  menos de 100 mil pessoas), o card sai com o meme da Xuxa de 1986 (“No Brasil não há homem para mim”).
- **Cinco imputações múltiplas** por trás de cada número: o valor exibido é a média e o app mostra
  a faixa entre imputações e a margem total (amostragem + imputação).

O que ele **não** responde: disponibilidade, atração, interesse recíproco, compatibilidade,
concorrência, distância dentro do estado ou chance de encontrar alguém. Ver
[limitações](site/metodologia.html#limitacoes).

## Autoria

Projeto independente, sem fins comerciais. O código e os dados derivados são
publicados sem atribuição nominal.

## Rodar localmente

```bash
cd delusionometro-br
python3 serve.py          # http://127.0.0.1:8765
```

O site é estático, mas precisa de HTTP para carregar `site/data/population.bin`. Abrir
`site/index.html` direto no navegador (`file://`) não funciona.

Também é possível publicar a pasta `site/` em qualquer hospedagem estática (Netlify, Vercel,
GitHub Pages, S3). Nesse caso, habilite compressão gzip/brotli: a base binária tem 4,3 MB e cai
para menos de 1,5 MB comprimida.

## Estrutura

```
delusionometro-br/
├── site/                     # aplicação estática (HTML, CSS, JS, dados)
│   ├── index.html            # calculadora
│   ├── metodologia.html      # método, fontes, limitações
│   ├── dados.html            # explorador + validação
│   ├── assets/css/style.css
│   ├── assets/js/
│   │   ├── data.js           # carrega e decodifica a base binária
│   │   ├── engine.js         # contagem ponderada, funil, impacto, score
│   │   ├── charts.js         # gráficos SVG sem dependências
│   │   ├── app.js            # UI da calculadora
│   │   ├── sharecard.js      # card PNG 1080×1350 (com meme quando raro)
│   │   ├── dados.js          # UI da página de dados
│   │   └── doc.js            # números dinâmicos da metodologia
│   └── data/                 # gerado pelo pipeline
├── pipeline/                 # reprodutibilidade
│   ├── 01_fetch_sidra.py
│   ├── 02_build_censo.py
│   ├── 03_extract_pns.py
│   ├── 03b_extract_pnad.py
│   ├── 04_impute.py
│   └── 05_export.py
├── data/                     # artefatos intermediários (não versionar)
├── raw/                      # microdados baixados (não versionar)
└── serve.py
```

## Dados e método (resumo)

| Etapa | Fonte | O que entra |
|---|---|---|
| Base demográfica | Censo 2022, amostra pública | sexo, idade (faixas de 5 anos), cor/raça, escolaridade, estado civil, filhos (mulheres), renda, condição de ocupação do domicílio, pesos |
| Altura e IMC | PNS 2013 + PNS 2019 | antropometria medida: 57.894 adultos da PNS 2013 + 6.315 da PNS 2019 |
| Fumo, filhos (homens), carro | PNS 2019 | tabagismo, fecundidade masculina, posse de automóvel |
| Renda em reais de 2025 | PNAD Contínua 2025 | mapeamento de quantis por sexo × escolaridade × idade |
| Totais populacionais | Censo 2022 (SIDRA 9514) | calibração por UF × sexo × faixa de idade |
| Altura / obesidade oficiais | PNS 2019 (SIDRA 8171 e 8168) | margens usadas na calibração e na validação |

A base final tem **226.692 registros** e representa **143,9 milhões de pessoas de 20 a 79 anos**.
Cada linha tem peso amostral; a contagem é a soma dos pesos de quem passa em todos os filtros.
Não há multiplicação de percentuais nem hipótese de independência. O pipeline gera **5 imputações**
independentes dos atributos modelados; o app conta cada uma e combina os resultados.

### Modelos de imputação

- **Altura**: cópula gaussiana com margem oficial de 2019 (P5/P50/P95 por sexo e grupo de idade);
  ordenação por escolaridade, renda domiciliar per capita e região, com efeito de ano
  (PNS 2013 + PNS 2019, n = 64.209).
- **IMC**: regressão de log(IMC) e deslocamento para reproduzir a prevalência oficial de
  obesidade por sexo e faixa de idade.
- **Tabagismo**: taxas suavizadas por sexo × idade × escolaridade (PNS 2019, n = 90.846).
- **Filhos (homens)**: taxas por idade × estado civil × escolaridade, calibradas na tabela 8303.
- **Carro no domicílio**: taxas por região × decil de renda per capita × urbano/rural.
- **Renda 2025**: mapeamento de quantis (Censo 2022 → PNAD 2025).

Cada atributo é validado contra a tabela oficial correspondente em `site/dados.html#validacao`.

## Reconstruir a base

Os arquivos brutos são grandes e não estão versionados. Os scripts baixam dos endereços oficiais
do IBGE (ou usam o cache em `raw/` e `data/raw_sidra/`):

```bash
python3 pipeline/01_fetch_sidra.py     # tabelas do SIDRA
python3 pipeline/02_build_censo.py     # amostra do Censo 2022 (27 UFs)
python3 pipeline/03_extract_pns.py     # microdados da PNS 2019
python3 pipeline/03c_extract_pns2013.py # microdados da PNS 2013 (antropometria, 59,6 mil adultos)
python3 pipeline/03b_extract_pnad.py   # microdados da PNAD 2025
python3 pipeline/04_impute.py          # modelos, calibração e population.bin
python3 pipeline/05_export.py          # copia artefatos e gera fontes.json
```

Requisitos: Python 3.12 com numpy e pandas. O download completo do Censo 2022 e das duas PNS soma cerca de
9 GB extraídos; a PNS, 434 MB; a PNAD 2025, 1,4 GB.

## Formato de `population.bin`

O arquivo tem **56 bytes por registro**: um bloco base de 20 bytes (imputação 1) seguido de
**4 blocos de 9 bytes** (imputações 2 a 5). Cada bloco de imputação contém, nesta ordem:
`altura` (uint8), `imc` (uint8), `fuma` (uint8), `filhos` (uint8), `carro` (uint8) e
`renda` (float32 LE). O bloco base, na ordem:

| Offset | Tipo | Campo |
|---|---|---|
| 0 | uint8 | UF (índice 0–26, ordem de `meta.json`) |
| 1 | uint8 | sexo (0 homem, 1 mulher) |
| 2 | uint8 | faixa de idade (0 = 20–24 … 11 = 75–79) |
| 3 | uint8 | cor/raça (0 branca … 4 indígena) |
| 4 | uint8 | escolaridade (0 a 3) |
| 5 | uint8 | estado civil (0 em união, 1 já viveu, 2 nunca) |
| 6 | uint8 | filhos (0, 1, 2+) |
| 7 | uint8 | fuma (0/1) |
| 8 | uint8 | IMC (0 baixo peso, 1 normal, 2 sobrepeso, 3 obesidade) |
| 9 | uint8 | carro no domicílio (0/1) |
| 10 | uint8 | casa própria (0/1) |
| 11 | uint8 | altura em cm |
| 12 | float32 LE | renda mensal em reais de 2025 |
| 16 | float32 LE | peso amostral |

`site/data/fontes.json` traz o SHA-256 do arquivo, as tabelas usadas, as variáveis e o resumo da
validação. Com 5 imputações, a base binária tem ~12,7 MB; o `population.bin` anterior de 20 bytes
por registro não é compatível. `site/data/amostra_20k.csv` é uma amostra legível só para inspeção — **não** use para
estimar totais, porque os pesos não foram redistribuídos.

## Card compartilhável

O botão **Compartilhar card** gera uma imagem 1080×1350 no próprio navegador, sem servidor:
número, percentual, “1 em X”, resumo dos filtros e as fontes. Em resultados raros, entra o recorte
de revista de 1986 com a Xuxa — imagem enviada pelo autor do projeto, usada como meme nostálgico,
sem fins comerciais. Em celulares com Web Share API, a imagem é compartilhada direto; nos demais
casos, é baixada e o link do cenário é copiado.

## O que já foi implementado da v2

- **PNS 2013** no modelo de altura/IMC (57.894 adultos com dados completos).
- **5 imputações múltiplas** e faixa de incerteza no app (amostragem + imputação).
- **Faixa entre imputações** exibida no card de resultado, além da margem total.
- O restante do roadmap — MRP municipal, cópula, Fay–Herriot, Pareto/IRPF, Vigitel — está
  especificado em [docs/estimativas-v2.md](docs/estimativas-v2.md).

## Próxima geração (v2)

O documento [Estimativas v2 — métodos e fontes](docs/estimativas-v2.md) varre modelos
hierárquicos bayesianos, MRP municipal, Fay–Herriot, cópulas/fusão de dados, múltipla
imputação, erro de medida e as fontes públicas que podem entrar (PNS 2013, POF, RAIS, IRPF,
Vigitel, Registro Civil, SINASC). Ele também traz o roadmap priorizado e os critérios de
validação.

## Limitações principais

- Faixas de idade de 5 anos (microdados públicos do Censo 2022); universo de 20 a 79 anos.
- Altura, IMC, fumo, filhos de homens e carro são imputados em 5 réplicas; as margens oficiais
  são preservadas, mas a associação com outros atributos carrega incerteza.
- Carro e casa própria são atributos do domicílio, não bens individuais.
- Estado civil em três grupos (em união / já viveu / nunca viveu).
- Recorte heterossexual e binário, porque é assim que as pesquisas do IBGE estruturam a amostra.
- Estimativa amostral: combinações raras têm margem de erro grande.

## Créditos e uso

Dados: IBGE — Censo Demográfico 2022, Pesquisa Nacional de Saúde 2013/2019 e PNAD Contínua 2025.
Os microdados são públicos; consulte os termos de uso do IBGE. As estimativas, os modelos e o
código deste projeto são independentes e não oficiais.

Projeto sem fins comerciais, feito para discussão pública com método aberto.

## Preview de link (OG)

O botão **Compartilhar com amigos** monta um link para
`https://ibgeros-og.vercel.app/r?...` com o resultado da pessoa. Essa função
serverless gera a imagem OG dinâmica em `/og.png`, com número, idade, percentual e
filtros, e redireciona para o site. O GitHub Pages continua sendo o site; a Vercel
só hospeda o preview.

Para publicar o preview:

```bash
cd og
npx vercel deploy --prod
```

O fallback estático do site (`assets/img/og-card.png`) continua valendo para quem
colar o link direto do GitHub Pages.

## Publicar no GitHub Pages

O site é estático e está em `site/`. A publicação usa a branch **`gh-pages`**,
que contém o conteúdo de `site/` na raiz (com `.nojekyll`). O repositório
principal guarda o código e os dados derivados.

Com o repositório remoto já configurado:

```bash
# publica o site (branch gh-pages)
git subtree split --prefix site -b gh-pages
git push origin gh-pages
```

No GitHub, em **Settings → Pages**, selecione **Source: Deploy from a branch**,
branch **`gh-pages`** e pasta **`/ (root)`**.

A URL pública é **https://ibgeros.github.io/** e também fica no campo
*Homepage* do repositório.

## Nota sobre espaço em disco

O cache bruto em `raw/` (Censo 2022 por UF, PNS 2019 e PNAD 2025) ocupa cerca de **12 GB**.
Ele não é necessário para servir o site depois que `data/population.bin` foi gerado e pode ser
apagado com `rm -rf raw/`; os scripts baixam tudo de novo a partir dos endereços oficiais do IBGE.
