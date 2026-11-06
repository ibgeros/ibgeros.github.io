# Estimativas v2 — métodos estatísticos e fontes de dados

Documento técnico de apoio ao **Há homem ou mulher pra mim no Brasil?**.
Não é uma promessa de precisão: é um mapa de onde o modelo atual perde, o que cada
método compra e quais dados públicos permitem chegar lá.

---

## Sumário executivo

O maior ganho não está em trocar a conta por uma “caixa-preta bayesiana”. Está em três
frentes, nesta ordem:

1. **Dados melhores para altura/IMC.** Já implementado: a PNS 2013 mediu **59.592 adultos**
   ([artigo SciELO](https://www.scielo.br/j/rbepid/a/QVtDq9fGVsG7JjwDZrTcXFh/?format=pdf&lang=pt)),
   contra 6.672 da PNS 2019. Usar as duas multiplica por dez a amostra antropométrica e
   reduz o erro dos gradientes de escolaridade, renda e região.
2. **Incerteza de verdade.** Hoje a margem exibida cobre só erro amostral. Um modelo
   bayesiano (ou múltipla imputação com bootstrap) produz **intervalos credíveis** que
   incluem imputação, modelo e amostragem — e deixa de fingir precisão em combinações raras.
3. **Recorte municipal (MRP).** O site vai até UF porque a amostra pública do Censo 2022
   não traz o código do município. Mas as **margens municipais por idade e sexo existem no
   SIDRA (tabela 9514, N6)**, e um modelo multinível com pós-estratificação (MRP) permite
   estimar o pool por cidade com incerteza.

O que **não** recomendo: usar dados de aplicativos de relacionamento como se fossem
representativos da população, ou trocar o microdado por um modelo generativo sem validação
externa. O ativo do projeto é a auditabilidade; qualquer v2 precisa preservá-la.

---

## 1. Onde o modelo atual perde

| Fonte de erro | Situação atual | Consequência |
|---|---|---|
| Amostra da PNS 2019 | 6.672 adultos medidos | Gradientes regionais/socioeconômicos ruidosos; caudas instáveis |
| Imputação de altura/IMC/fumo/filhos/carro | Modelos condicionais + sorteio | Incerteza de imputação não entra no intervalo exibido |
| Dependência entre atributos | População sintética com imputação condicional | Boa para médias, mas a cauda conjunta pode ficar otimista/pessimista |
| Renda | Mapeamento de quantis Censo 2022 → PNAD 2025 | Supõe estabilidade da ordem relativa dentro de sexo × escolaridade × idade |
| Cauda superior de renda | PNAD com topo em R$ 310 mil | Filtros de R$ 20 mil+ dependem de poucos registros; cauda pouco modelada |
| Geografia | UF | Não responde “na minha cidade” |
| Idade | Faixas de 5 anos (microdado público) | 18–19 fora; perda de granularidade |
| Incerteza | 5 imputações + aproximação normal com n_eff | Ainda não cobre incerteza dos coeficientes nem dependência não modelada |
| Populações especiais | Recorte binário/heterossexual | Fora do escopo dos dados oficiais usados |

O ponto central: **o problema não é “faltar Bayes”; é faltar uma modelagem conjunta e uma
propagação de incerteza**. Um modelo bayesiano mal especificado é tão ou mais enganoso que
a contagem atual.

---

## 2. Fontes de dados

### 2.1 O que já está no projeto

| Fonte | O que oferece | Granularidade | Limites | Uso atual |
|---|---|---|---|---|
| **Censo 2022** — universo e amostra | sexo, idade, cor/raça, escolaridade, estado civil, filhos (mulheres), renda, condição de ocupação do domicílio | UF na amostra pública; município nas tabelas agregadas ([9514 N6](https://servicodados.ibge.gov.br/api/v3/agregados/9514/periodos/2022/variaveis/93?localidades=N6%5B3550308%5D)) | idade em faixas de 5 anos; amostra pública sem código de município; renda de 2022 | base demográfica |
| **PNS 2013** | altura e peso **medidos** de 59.592 adultos; fumo, doenças, acesso | Brasil, regiões, UF | 2013; desenho complexo | modelo de altura/IMC |
| **PNS 2019** | altura/peso medidos de 6.672 adultos; fumo, fecundidade masculina, automóvel | Brasil, regiões, UF | subamostra pequena; 2019 | altura/IMC, fumo, filhos, carro |
| **PNAD Contínua 2025** | renda de todas as fontes, escolaridade, ocupação; **200 pesos replicados** | UF, capital, RM | sem altura, estado civil ou filhos; anual | renda 2025 |

### 2.2 Fontes que podem entrar

| Fonte | O que acrescenta | Granularidade | Cuidados | Prioridade |
|---|---|---|---|---|
| **POF 2017–2018** | posse de bens duráveis (inclusive automóvel), condição de ocupação, consumo, renda | UF/estratos | **não mediu altura/peso** ([leia-me](https://ftp.ibge.gov.br/Orcamentos_Familiares/Pesquisa_de_Orcamentos_Familiares_2017_2018/Microdados/Leiame_Microdados_POF2017_2018_20231006.pdf); 2017–18 | média |
| **Vigitel** | altura/peso autorreferidos e fumo, anuais, capitais | capitais | viés de autorrelato; corrigir com PNS medida | média |
| **IRPF — Grandes Números** | cauda superior de renda, faixas e declarações | nacional/UF (verificar município) | subdeclaração; não é renda de todos | alta para topo |
| **RAIS** | vínculos formais e remuneração por município | município | só setor formal | alta para MRP/cidade |
| **Registro Civil** | casamentos e divórcios por idade/município | município | não observa união consensual | média |
| **SINASC** | nascimentos por idade/educação da mãe e município | município | fecundidade, não número de filhos por mulher | média |
| **Censo 2022 — agregados municipais** | margens de idade/sexo (e outras) por município | município | não permite cruzar todos os atributos | **alta** para MRP |
| **Censo 2010 / PNAD histórica** | tendências de longo prazo | UF | velhos | baixa |
| **TSE** | eleitorado por idade/sexo/município | município | não tem escolaridade/renda/filhos | baixa |
| **Dados de aplicativos** | intenção declarada, comportamento | usuários | seleção brutal; privacidade; não representativo | **não usar como população** |

> Para o recorte municipal, a combinação mais promissora é: **margens do Censo 2022 (N6) +
> RAIS/IRPF como covariáveis de área + PNAD/PNS para os efeitos individuais**, com MRP.

---

## 3. Métodos estatísticos

### 3.1 Modelos hierárquicos bayesianos (partial pooling)

**O que resolve:** células pequenas (UF × idade × escolaridade; caudas de altura/renda),
encolhimento de estimativas instáveis e quantificação de incerteza.

**Como ficaria:**

```
y_i ~ Normal(α + x_i'β + u_{região(i)} + v_{UF(i)}, σ²)
u_r ~ Normal(0, τ_r²),  v_u ~ Normal(0, τ_u²)
priors fracamente informativas para α, β, σ, τ
```

- Para altura: modelo normal/quantílico com efeitos aleatórios de região/UF e coorte.
- Para IMC: regressão distribucional (GAMLSS) ou modelo ordinal para obesidade.
- Para renda: log-normal com cauda Pareto, ou regressão quantílica.
- Para binários (fuma, tem carro, sem filhos): logística multinível.

**Ganho:** intervalos credíveis, estabilização de células raras, possibilidade de
pós-estratificação. **Custo:** médio; MCMC/INLA; precisa de priors e checagem.

**Referências:** Gelman et al. (2013); Gelman & Hill (2006); Rao & Molina (2015).

### 3.2 MRP — multilevel regression and poststratification

**O que resolve:** estimativas por **município** (e por recortes finos) sem amostra
individual municipal.

**Como funciona:**

1. Ajusta-se um modelo individual para o atributo (ex.: altura ≥ 175 cm) com idade, sexo,
   escolaridade, raça, UF e covariáveis de área.
2. Pós-estratifica-se para as células do Censo 2022 (município × idade × sexo × escolaridade
   × raça), usando as margens municipais.
3. Somam-se as previsões posteriores; a incerteza vem da posterior.

**Dados:** PNAD/PNS para o modelo individual; Censo 2022 N6 para as células; RAIS/IRPF para
covariáveis municipais.

**Ganho:** filtro por cidade; ranking municipal; intervalos. **Custo:** alto; exige
harmonização e validação.

**Referências:** Gelman & Little (1997); Park, Gelman & Bafumi (2004); Si (2022).

### 3.3 Small area estimation — Fay–Herriot e afins

**O que resolve:** municípios com amostra pequena ou inexistente; combina estimativa direta
com covariáveis e efeitos de área.

**Quando usar:** quando o atributo já tem estimativa direta por área (ex.: proporção de
domicílios com carro) e se quer estabilizar. É mais simples que MRP, mas não resolve o
cruzamento individual de vários atributos.

**Referência brasileira recente:** *Quarterly Small Area Estimates of Extreme Poverty in
Brazil Using Transformed Fay–Herriot Models* (JSSAM, 2025)
([link](https://academic.oup.com/jssam/article/13/5/552/8277613)).

### 3.4 Copulas e fusão de dados

**O que resolve:** combinar pesquisas com variáveis diferentes (PNAD: renda/educação;
PNS: altura/IMC/fumo; POF: bens/casa) preservando a dependência entre elas.

**Como funciona:** modela-se a dependência com uma cópula (gaussiana, t, vine) e as marginais
com as distribuições oficiais. A população sintética é uma amostra da distribuição conjunta;
a incerteza vem de bootstrap/posterior.

**Ganho:** caudas conjuntas mais realistas (ex.: alto e rico; alto e sem filhos) e
quantificação da incerteza de fusão. **Custo:** alto; a cópula é uma hipótese forte e precisa
ser testada.

**Referências:** *Official Statistics Data Integration Using Copulas* (2014,
[DOI](https://doi.org/10.1080/16843703.2014.11673329)); *Unit level small area estimation
with copulas* (2023, [DOI](https://doi.org/10.1002/cjs.11296)); Rässler (2002).

### 3.5 Múltipla imputação e erro de medida

**Múltipla imputação (MICE):** gera 20–50 populações imputadas; cada análise é feita em
todas; a variância total combina within e between. É o caminho mais direto para incluir a
incerteza da imputação no intervalo.

**Erro de medida:** altura/peso autorreferidos (Vigitel) subestimam obesidade e superestimam
altura. Corrigir com regressão de calibração usando a PNS medida
([estudo de correção](https://cadernos.ensp.fiocruz.br/ojs/index.php/csp/article/download/7039/15340?inline=1)).
Hoje o projeto usa medidas, então esse viés não entra — mas entraria se Vigitel fosse usada
para tendências.

**Referências:** Rubin (1987); van Buuren (2018); Carroll et al. (2006).

### 3.6 Regressão distribucional e modelos flexíveis

**GAMLSS**, regressão quantílica, **BART** e random forests podem capturar não linearidades
e heterocedasticidade (renda, IMC, altura). O ganho é maior na cauda; o custo é
interpretabilidade e risco de overfitting.

**Recomendação:** usar como *engine* condicional dentro de um modelo bayesiano validado, não
como caixa-preta substituindo a conta auditável. Comparar com GAMLSS/quantílica e reportar
LOO/WAIC.

### 3.7 Redes bayesianas para atributos categóricos

**O que resolve:** dependência entre sexo, idade, escolaridade, estado civil, filhos, fumo,
carro e casa sem impor uma ordem de imputação.

**Como funciona:** aprende-se um DAG (estrutura) a partir do Censo/PNS; inferência exata por
mensagem; amostragem da posterior para incerteza. É interpretável e auditável.

**Limite:** variáveis contínuas (altura, renda) exigem discretização ou modelos condicionais
separados.

### 3.8 Modelos espaciais (BYM2/INLA)

**O que resolve:** suavização espacial de municípios vizinhos, evitando estimativas
extremas em áreas pequenas.

**Cuidado:** suavizar demais esconde heterogeneidade real; usar prior espacial com escala
explícita (BYM2) e validar contra o Censo.

**Referências:** Rue et al. (2009); Riebler et al. (2016).

### 3.9 Calibração, raking e populações sintéticas

O projeto já usa uma forma de reconstrução sintética: amostra do Censo + imputação
condicional + pesos. Alternativas:

- **IPF/raking** para casar margens censusis (idade × sexo × UF × escolaridade).
- **Bayesian melding**: combina modelo e margens oficiais com incerteza.
- **Reconstrução sintética combinatória** (simulated annealing) para respeitar margens e
  estrutura de dependência.

**Referência:** Deming & Stephan (1940); Deville & Särndal (1992).

### 3.10 Incerteza e desenho amostral

- **PNAD Contínua** traz **200 pesos replicados**; com eles é possível estimar variância
  design-based para renda/educação.
- **PNS** e **Censo** têm desenho complexo; bootstrap estratificado ou réplicas.
- **Posterior draws** do modelo bayesiano substituem a aproximação normal.
- **Sensibilidade**: comparar independência, cópula e modelos alternativos; reportar faixa.

**Recomendação:** trocar o intervalo normal atual por **intervalo de 95% com componente de
imputação + amostragem**, e exibir “faixa plausível” em vez de um número seco.

### 3.11 Validação

- **Posterior predictive checks** contra margens oficiais (Censo/PNS/PNAD).
- **LOO/WAIC** para comparação de modelos.
- **Cobertura** dos intervalos contra estimativas oficiais.
- **Calibração** (reliability) para binários.
- **Benchmark externo**: Vigitel (fumo/IMC), POF (carro/casa), IRPF/RAIS (renda alta).
- **Small-area validation**: municípios com amostra suficiente; erro contra estimativa direta.
- **Sensibilidade a priors** e à escolha da cópula.

---

## 4. Arquitetura recomendada

```
Camada de dados
  Censo 2022 (amostra + margens N6)
  PNAD Contínua 2025 (renda, educação, réplicas)
  PNS 2013 + 2019 (antropometria, fumo, carro, filhos)
  POF 2017–18 (bens, casa)
  RAIS / IRPF (covariáveis municipais e cauda)
        ↓ harmonização, dicionário comum, versionamento
Camada de modelo
  Modelos hierárquicos bayesianos por atributo
  Cópula/rede bayesiana para dependência
  MRP para município
  Múltipla imputação / posterior draws
        ↓
Camada de produto
  Populações sintéticas replicadas (20–50)
  Contagem no navegador + intervalos credíveis
  Filtro por município
  “Modo incerteza” e sensibilidade
        ↓
Camada de validação
  PPC, LOO, cobertura, benchmark externo
```

**Decisão de arquitetura:** manter o cálculo no navegador para auditabilidade e privacidade;
pré-computar as populações replicadas (ou pesos) no pipeline; nunca enviar filtros do usuário
para servidor.

---

## 5. Roadmap priorizado

| Fase | Entrega | Impacto | Esforço | Depende de |
|---|---|---|---|---|
| **0 (feito)** | PNS 2013 + PNS 2019 no modelo de altura/IMC | alto | baixo | microdados |
| **1 (feito, versão inicial)** | 5 imputações + faixa entre imputações no app; margem total (amostragem + imputação) | alto | baixo/médio | PNAD bootstrap |
| **2** | Modelo hierárquico bayesiano de altura/IMC/renda; posterior draws; validação | alto | médio | Stan/PyMC/INLA |
| **3** | Cópula/rede bayesiana para dependência; múltipla imputação | alto | médio/alto | PNS/PNAD/POF |
| **4** | MRP municipal + RAIS/IRPF; filtro por cidade | muito alto | alto | Censo N6, RAIS |
| **5** | Cauda superior (Pareto/IRPF); correção de autorrelato (Vigitel); tendências 2019→2025 | médio | médio | IRPF/Vigitel |
| **6** | Dashboard de validação e sensibilidade; model cards | médio | baixo | fases 1–5 |

**Sugestão de sequência:** 1 → 2 → 4 → 3 → 5. O filtro por cidade (4) é o maior salto de
produto; a cópula (3) é o maior salto de realismo estatístico, mas só depois de a incerteza
estar honesta.

---

## 6. Ganhos esperados (ordem de magnitude)

- **PNS 2013:** o erro-padrão dos coeficientes de escolaridade/renda/região cai
  substancialmente (amostra 10× maior). Já implementado.
- **Incerteza bayesiana:** intervalos deixam de ser otimistas em combinações raras; o app
  passa a dizer “entre X e Y” em vez de um número exato.
- **MRP:** estimativas municipais com intervalos; hoje o menor recorte é UF.
- **Cópula/fusão:** caudas conjuntas mais realistas; evita que a independência condicional
  superestime ou subestime perfis como “alto + rico + sem filhos”.
- **Cauda de renda:** filtros de R$ 20 mil+ deixam de depender de poucos registros da PNAD.
- **Erro de medida:** se Vigitel entrar, corrigir o viés de autorrelato.

---

## 7. Riscos e critérios de decisão

| Risco | Mitigação |
|---|---|
| Complexidade reduzir auditabilidade | model cards, priors explícitos, código versionado, validação pública |
| Priors influenciarem caudas | priors fracamente informativos + análise de sensibilidade |
| Pequenas áreas com dados fracos | MRP com covariáveis, benchmarking, intervalos largos honestos |
| Cópula ser hipótese forte | comparar com independência e com modelos alternativos; reportar faixa |
| Custo computacional | pré-computar posterior draws; app só filtra |
| Interpretação pública | linguagem de “estimativa” e “faixa”, não “verdade” |
| Privacidade | nunca usar dados individuais de apps; só microdados públicos agregados |

**Critério:** só adotar um método se ele (a) corrigir um viés identificável, (b) puder ser
validado contra uma fonte oficial e (c) não destruir a rastreabilidade.

---

## 8. Referências

### Dados

- IBGE. **PNS 2013 — microdados**. https://ftp.ibge.gov.br/PNS/2013/Microdados/
- IBGE. **PNS 2019 — microdados**. https://ftp.ibge.gov.br/PNS/2019/Microdados/
- IBGE. **PNS 2019 — nota técnica de antropometria**. https://biblioteca.ibge.gov.br/visualizacao/livros/liv101839.pdf
- SciELO. **Variações de indicadores antropométricos entre 2013 e 2019** (n = 59.592 e 6.672). https://www.scielo.br/j/rbepid/a/QVtDq9fGVsG7JjwDZrTcXFh/
- IBGE. **Censo 2022 — população por idade e sexo (SIDRA 9514, inclusive N6)**. https://sidra.ibge.gov.br/tabela/9514
- IBGE. **Censo 2022 — microdados públicos**. https://ftp.ibge.gov.br/Censos/Censo_Demografico_2022/Microdados_e_Areas_de_Ponderacao/
- IBGE. **PNAD Contínua — notas técnicas**. https://biblioteca.ibge.gov.br/visualizacao/livros/liv101561_notas_tecnicas.pdf
- IBGE. **POF 2017–2018 — leia-me dos microdados**. https://ftp.ibge.gov.br/Orcamentos_Familiares/Pesquisa_de_Orcamentos_Familiares_2017_2018/Microdados/Leiame_Microdados_POF2017_2018_20231006.pdf
- Folha Vitória. **POF 2017–2018 não mediu peso e altura**. https://www.folhavitoria.com.br/economia/dados-antropometricos-peso-e-altura-ficarao-de-fora-da-pof-2017-2018-do-ibge/
- Receita Federal. **Grandes Números do IRPF**. https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/estudos/imposto-de-renda/estudos-por-ano/grandes-numeros-do-IRPF-2008-a-2023
- Ministério do Trabalho e Emprego. **RAIS**. https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/estatisticas-trabalho/rais
- Ministério da Saúde. **Vigitel**. https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/v/vigitel
- IBGE. **Registro Civil**. https://www.ibge.gov.br/estatisticas/sociais/populacao/9110-estatisticas-do-registro-civil.html
- DATASUS. **SINASC**. https://datasus.saude.gov.br/nascidos-vivos-desde-1994

### Métodos

- Gelman, A., Carlin, J., Stern, H., Dunson, D., Vehtari, A., Rubin, D. (2013). *Bayesian Data Analysis*. CRC.
- Gelman, A., Hill, J. (2006). *Data Analysis Using Regression and Multilevel/Hierarchical Models*. Cambridge.
- Gelman, A., Little, T. (1997). Poststratification into many categories using hierarchical logistic regression. *Survey Methodology*, 23, 127–135.
- Park, D., Gelman, A., Bafumi, J. (2004). Bayesian multilevel estimation with poststratification. *Political Analysis*, 12, 375–385.
- Rao, J.N.K., Molina, I. (2015). *Small Area Estimation*. Wiley.
- Fay, R., Herriot, R. (1979). Estimates of income for small places. *JASA*, 74, 269–277.
- Rubin, D. (1987). *Multiple Imputation for Nonresponse in Surveys*. Wiley.
- Rässler, S. (2002). *Statistical Matching*. Springer.
- Carroll, R., Ruppert, D., Stefanski, L., Crainiceanu, C. (2006). *Measurement Error in Nonlinear Models*. Chapman & Hall.
- Rigby, R., Stasinopoulos, D. (2005). Generalized additive models for location, scale and shape. *JRSS-C*, 54, 507–554.
- Riebler, A., Sørbye, S., Simpson, D., Rue, H. (2016). An intuitive Bayesian spatial model for disease mapping that accounts for scaling. *Statistical Methods in Medical Research*, 25, 1145–1165.
- Rue, H., Martino, S., Chopin, N. (2009). Approximate Bayesian inference for latent Gaussian models using INLA. *JRSS-B*, 71, 319–392.
- Vehtari, A., Gelman, A., Gabry, J. (2017). Practical Bayesian model evaluation using LOO-CV and WAIC. *Statistics and Computing*, 27, 1413–1432.
- **Quarterly Small Area Estimates of Extreme Poverty in Brazil Using Transformed Fay–Herriot Models** (JSSAM, 2025). https://academic.oup.com/jssam/article/13/5/552/8277613
- **Official Statistics Data Integration Using Copulas** (2014). https://doi.org/10.1080/16843703.2014.11673329
- **Unit level small area estimation with copulas** (2023). https://doi.org/10.1002/cjs.11296
- Cadernos de Saúde Pública. **Subestimativa de obesidade e sobrepeso a partir de medidas autorrelatadas**. https://cadernos.ensp.fiocruz.br/ojs/index.php/csp/article/download/7039/15340?inline=1

---

## 9. O que já mudou no projeto

- **PNS 2013 integrada** ao modelo de altura/IMC: 57.894 adultos de 2013 + 6.315 de 2019
  com informação completa (64.209 registros). O nível é ancorado nos percentis oficiais de
  2019; a PNS 2013 dá precisão aos gradientes.
- **5 imputações múltiplas** dos atributos modelados, com faixa entre imputações e
  combinação de variância (Rubin) no app. O ideal seriam 20–50 imputações; 5 é o
  compromisso que cabe no arquivo binário (12,7 MB).
- **Fonte e modelo documentados** na página de metodologia e no `fontes.json`.
- **Validação** continua batendo as margens oficiais de altura e obesidade; totais
  populacionais com erro médio de 0,13%.

A **fase 1** já está em produção: 5 imputações, faixa entre imputações e margem total no app.
O próximo passo é o **MRP municipal** (fase 4 no roadmap), que exige margens N6 e covariáveis
municipais, e depois a **cópula/rede bayesiana** para a dependência conjunta.
