"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2, Lock, Mail, Phone, User } from "lucide-react";
import {
  criarConta,
  entrarComGoogle,
  entrarComSenha,
  enviarLinkDeRecuperacao,
} from "@/lib/supabase/auth";

/* ------------------------------------------------------------------ *
 * Fundo de fumaça em WebGL
 * ------------------------------------------------------------------ */

const vertexSmokeySource = `
  attribute vec4 a_position;
  void main() {
    gl_Position = a_position;
  }
`;

/* A única mudança de verdade no shader é a cor.
 *
 * O original fazia `u_color * glow`: a fumaça nascia de um preto puro e
 * clareava para o azul. Aqui ela sobe por três paradas da paleta do site —
 * --bg (#1b1108) no escuro, --leather (#5c4128) no corpo da fumaça, e --gold
 * (#b3854e) só nas cristas.
 *
 * Três e não duas de propósito. Interpolando direto de --bg para --gold, metade
 * da tela vira um campo dourado chapado, e style.css é explícito sobre isso:
 * "Dourado — detalhe refinado, não predominante". O expoente alto no segundo
 * mix é o que segura o ouro nas pontas; o couro no meio é o que mantém a
 * fumaça legível sem precisar do dourado para existir. */
const fragmentSmokeySource = `
precision mediump float;

uniform vec2 iResolution;
uniform float iTime;
uniform vec2 iMouse;
uniform vec3 u_color;
uniform vec3 u_base;
uniform vec3 u_mid;

void mainImage(out vec4 fragColor, in vec2 fragCoord){
    vec2 centeredUV = (2.0 * fragCoord - iResolution.xy) / min(iResolution.x, iResolution.y);

    float time = iTime * 0.5;

    vec2 mouse = iMouse / iResolution;
    vec2 rippleCenter = 2.0 * mouse - 1.0;

    vec2 distortion = centeredUV;
    for (float i = 1.0; i < 8.0; i++) {
        distortion.x += 0.5 / i * cos(i * 2.0 * distortion.y + time + rippleCenter.x * 3.1415);
        distortion.y += 0.5 / i * cos(i * 2.0 * distortion.x + time + rippleCenter.y * 3.1415);
    }

    float wave = abs(sin(distortion.x + distortion.y + time));
    float glow = smoothstep(0.9, 0.2, wave);

    vec3 fumaca = mix(u_base, u_mid, pow(glow, 1.4));
    fumaca = mix(fumaca, u_color, pow(glow, 5.0) * 0.6);

    fragColor = vec4(fumaca, 1.0);
}

void main() {
    mainImage(gl_FragColor, gl_FragCoord.xy);
}
`;

type BlurSize = "none" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl";

interface SmokeyBackgroundProps {
  /** Desfoque aplicado por cima da fumaça, para o cartão de vidro ter o que borrar. */
  backdropBlurAmount?: BlurSize;
  /** Cor das cristas. Padrão: --gold da Florenza. */
  color?: string;
  /** Cor do fundo, onde a fumaça se apaga. Padrão: --bg da Florenza. */
  baseColor?: string;
  /** Cor do corpo da fumaça, entre o fundo e as cristas. Padrão: --leather. */
  midColor?: string;
  className?: string;
}

const blurClassMap: Record<BlurSize, string> = {
  none: "backdrop-blur-none",
  sm: "backdrop-blur-sm",
  md: "backdrop-blur-md",
  lg: "backdrop-blur-lg",
  xl: "backdrop-blur-xl",
  "2xl": "backdrop-blur-2xl",
  "3xl": "backdrop-blur-3xl",
};

function hexParaRgb(hex: string): [number, number, number] {
  const limpo = hex.replace("#", "");
  const cheio = limpo.length === 3 ? limpo.split("").map((c) => c + c).join("") : limpo;
  return [
    parseInt(cheio.substring(0, 2), 16) / 255,
    parseInt(cheio.substring(2, 4), 16) / 255,
    parseInt(cheio.substring(4, 6), 16) / 255,
  ];
}

/**
 * Fumaça animada em WebGL, nas cores do site.
 *
 * Três correções em relação ao componente de origem, todas de ciclo de vida —
 * sem elas a tela degrada em segundos:
 *
 * 1. A posição do mouse vive num `ref`, não em `useState`. No original ela era
 *    estado e entrava nas dependências do efeito, então **cada movimento do
 *    mouse recompilava os shaders e ligava mais um `requestAnimationFrame`**.
 *    Em poucos segundos há dezenas de laços desenhando ao mesmo tempo.
 * 2. O laço é cancelado na limpeza, e o programa/shaders/buffer são liberados.
 *    O original nunca parava o `requestAnimationFrame`: ao sair da página, ele
 *    seguia rodando contra um canvas que não existe mais.
 * 3. `prefers-reduced-motion` desenha um quadro só e para — é regra deste
 *    projeto, e vale ainda mais para um fundo que pulsa atrás de um formulário.
 */
export function SmokeyBackground({
  backdropBlurAmount = "sm",
  color = "#b3854e",
  baseColor = "#1b1108",
  midColor = "#5c4128",
  className = "",
}: SmokeyBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
    if (!gl) return; // Sem WebGL o CSS de fallback já pinta o fundo em --bg.

    const compilar = (tipo: number, fonte: string) => {
      const shader = gl.createShader(tipo);
      if (!shader) return null;
      gl.shaderSource(shader, fonte);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vertexShader = compilar(gl.VERTEX_SHADER, vertexSmokeySource);
    const fragmentShader = compilar(gl.FRAGMENT_SHADER, fragmentSmokeySource);
    if (!vertexShader || !fragmentShader) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const posicao = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(posicao);
    gl.vertexAttribPointer(posicao, 2, gl.FLOAT, false, 0, 0);

    const uResolucao = gl.getUniformLocation(program, "iResolution");
    const uTempo = gl.getUniformLocation(program, "iTime");
    const uMouse = gl.getUniformLocation(program, "iMouse");

    const [r, g, b] = hexParaRgb(color);
    gl.uniform3f(gl.getUniformLocation(program, "u_color"), r, g, b);
    const [br, bg, bb] = hexParaRgb(baseColor);
    gl.uniform3f(gl.getUniformLocation(program, "u_base"), br, bg, bb);
    const [mr, mg, mb] = hexParaRgb(midColor);
    gl.uniform3f(gl.getUniformLocation(program, "u_mid"), mr, mg, mb);

    // Metade da resolução física já basta: é fumaça desfocada, e o custo por
    // pixel deste shader (7 iterações de cosseno) pesa no celular.
    const escala = Math.min(window.devicePixelRatio || 1, 1.5) * 0.5;
    const semMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const inicio = Date.now();
    let quadro = 0;

    const desenhar = (tempo: number) => {
      const largura = Math.max(1, Math.floor(canvas.clientWidth * escala));
      const altura = Math.max(1, Math.floor(canvas.clientHeight * escala));
      if (canvas.width !== largura || canvas.height !== altura) {
        canvas.width = largura;
        canvas.height = altura;
        gl.viewport(0, 0, largura, altura);
      }

      const m = mouseRef.current;
      gl.uniform2f(uResolucao, largura, altura);
      gl.uniform1f(uTempo, tempo);
      gl.uniform2f(
        uMouse,
        m ? m.x * escala : largura / 2,
        m ? altura - m.y * escala : altura / 2
      );
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    if (semMovimento) {
      desenhar(0);
    } else {
      const laco = () => {
        desenhar((Date.now() - inicio) / 1000);
        quadro = requestAnimationFrame(laco);
      };
      laco();
    }

    const aoMover = (evento: MouseEvent) => {
      const area = canvas.getBoundingClientRect();
      mouseRef.current = { x: evento.clientX - area.left, y: evento.clientY - area.top };
    };
    const aoSair = () => {
      mouseRef.current = null;
    };

    canvas.addEventListener("mousemove", aoMover);
    canvas.addEventListener("mouseleave", aoSair);

    return () => {
      cancelAnimationFrame(quadro);
      canvas.removeEventListener("mousemove", aoMover);
      canvas.removeEventListener("mouseleave", aoSair);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
    };
  }, [color, baseColor, midColor]);

  return (
    <div className={`entrar__fundo ${className}`} aria-hidden="true">
      <canvas ref={canvasRef} className="entrar__canvas" />
      <div className={`entrar__veu ${blurClassMap[backdropBlurAmount]}`} />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Formulário
 * ------------------------------------------------------------------ */

type Modo = "entrar" | "criar";

/**
 * Entrar e criar conta, na mesma tela.
 *
 * É a mesma autenticação de /conta — mesmo banco, mesma tabela `auth.users`,
 * mesma trigger que cria o perfil. Quem cria a conta por aqui aparece na aba
 * Clientes do painel exatamente como quem cria por lá; nada é sincronizado
 * depois.
 *
 * As chamadas ao Supabase moram em lib/supabase/auth.ts e não aqui: são as
 * mesmas de ContaFormulario, e o `emailRedirectTo` escrito em dois lugares é o
 * tipo de coisa que diverge em silêncio e só aparece quando um cliente recebe
 * um link para localhost.
 */
export function LoginForm({ redirect = "/", demo = false }: { redirect?: string; demo?: boolean }) {
  const [modo, setModo] = useState<Modo>("entrar");
  const [enviando, setEnviando] = useState<"senha" | "google" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [recado, setRecado] = useState<string | null>(null);

  function trocarModo(novo: Modo) {
    setModo(novo);
    setErro(null);
    setRecado(null);
  }

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (demo) return;
    setErro(null);
    setRecado(null);

    const dados = new FormData(evento.currentTarget);
    const email = String(dados.get("email") ?? "").trim();
    const senha = String(dados.get("senha") ?? "");

    setEnviando("senha");

    if (modo === "criar") {
      const { erro } = await criarConta({
        email,
        senha,
        nome: String(dados.get("nome") ?? "").trim(),
        telefone: String(dados.get("telefone") ?? "").trim(),
      });
      setEnviando(null);
      if (erro) {
        setErro(erro);
        return;
      }
      // Volta para "entrar" porque é o próximo passo de verdade: a conta só
      // funciona depois de confirmar o e-mail.
      setModo("entrar");
      setRecado("Conta criada. Confira seu e-mail para confirmar o cadastro e depois entre por aqui.");
      return;
    }

    const { erro } = await entrarComSenha(email, senha);
    if (erro) {
      setEnviando(null);
      setErro(erro);
      return;
    }

    // `window.location.assign` e não `router.push`, pelo mesmo motivo de
    // ContaFormulario: a navegação do Next não recarrega o documento, e o
    // Server Component do destino poderia rodar antes de o cookie de sessão
    // existir — voltando para o login.
    window.location.assign(redirect);
  }

  async function comGoogle() {
    if (demo) return;
    setErro(null);
    setRecado(null);
    setEnviando("google");

    const { erro } = await entrarComGoogle(redirect);
    if (erro) {
      setEnviando(null);
      setErro(erro);
    }
  }

  async function recuperarSenha() {
    if (demo) return;
    const campo = document.getElementById("entrar-email") as HTMLInputElement | null;
    const email = campo?.value.trim();
    if (!email) {
      setErro("Escreva seu e-mail no campo acima para receber o link de recuperação.");
      return;
    }
    setErro(null);
    await enviarLinkDeRecuperacao(email);
    setRecado("Se houver uma conta com esse e-mail, o link de recuperação chegou na caixa de entrada.");
  }

  return (
    <div className="entrar__caixa">
      <p className="entrar__eyebrow">Florenza</p>
      <h1 className="entrar__titulo">
        {modo === "entrar" ? "Bem-vindo de volta" : "Criar conta"}
      </h1>
      <p className="entrar__sub">
        {modo === "entrar"
          ? "Entre para acompanhar seus pedidos e suas peças favoritas."
          : "Leva um minuto. Depois é só confirmar o e-mail."}
      </p>

      <div className="entrar__abas" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={modo === "entrar"}
          className={`entrar__aba${modo === "entrar" ? " is-active" : ""}`}
          onClick={() => trocarModo("entrar")}
        >
          Entrar
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={modo === "criar"}
          className={`entrar__aba${modo === "criar" ? " is-active" : ""}`}
          onClick={() => trocarModo("criar")}
        >
          Criar conta
        </button>
      </div>

      {demo && (
        <p className="entrar__aviso">
          <strong>Modo demonstração.</strong> O Supabase não está conectado nesta cópia, então
          não é possível entrar nem criar conta.
        </p>
      )}

      <form className="entrar__form" onSubmit={enviar}>
        {modo === "criar" && (
          <>
            <div className="entrar__campo">
              <input
                className="entrar__input"
                type="text"
                id="entrar-nome"
                name="nome"
                placeholder=" "
                autoComplete="name"
                required
              />
              <label className="entrar__rotulo" htmlFor="entrar-nome">
                <User aria-hidden size={14} />
                Nome
              </label>
            </div>

            <div className="entrar__campo">
              <input
                className="entrar__input"
                type="tel"
                id="entrar-telefone"
                name="telefone"
                placeholder=" "
                autoComplete="tel"
              />
              <label className="entrar__rotulo" htmlFor="entrar-telefone">
                <Phone aria-hidden size={14} />
                Telefone
              </label>
            </div>
          </>
        )}

        <div className="entrar__campo">
          <input
            className="entrar__input"
            type="email"
            id="entrar-email"
            name="email"
            placeholder=" "
            autoComplete="email"
            required
          />
          <label className="entrar__rotulo" htmlFor="entrar-email">
            <Mail aria-hidden size={14} />
            E-mail
          </label>
        </div>

        <div className="entrar__campo">
          <input
            className="entrar__input"
            type="password"
            id="entrar-senha"
            name="senha"
            placeholder=" "
            autoComplete={modo === "entrar" ? "current-password" : "new-password"}
            minLength={modo === "criar" ? 8 : undefined}
            required
          />
          <label className="entrar__rotulo" htmlFor="entrar-senha">
            <Lock aria-hidden size={14} />
            {modo === "criar" ? "Senha (ao menos 8 caracteres)" : "Senha"}
          </label>
        </div>

        {modo === "entrar" && (
          <button type="button" className="entrar__esqueci" onClick={recuperarSenha} disabled={demo}>
            Esqueci minha senha
          </button>
        )}

        <button className="entrar__botao" type="submit" disabled={enviando !== null || demo}>
          {enviando === "senha" ? (
            <Loader2 aria-hidden size={15} className="animate-spin" />
          ) : null}
          {modo === "entrar" ? "Entrar" : "Criar conta"}
          <ArrowRight aria-hidden size={16} className="entrar__seta" />
        </button>

        <div className="entrar__divisor">
          <span>ou continue com</span>
        </div>

        <button
          type="button"
          className="entrar__google"
          onClick={comGoogle}
          disabled={enviando !== null || demo}
        >
          <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
            <path
              fill="#FFC107"
              d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039L38.802 8.841C34.553 4.806 29.613 2.5 24 2.5C11.983 2.5 2.5 11.983 2.5 24s9.483 21.5 21.5 21.5S45.5 36.017 45.5 24c0-1.538-.135-3.022-.389-4.417z"
            />
            <path
              fill="#FF3D00"
              d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12.5 24 12.5c3.059 0 5.842 1.154 7.961 3.039l5.839-5.841C34.553 4.806 29.613 2.5 24 2.5C16.318 2.5 9.642 6.723 6.306 14.691z"
            />
            <path
              fill="#4CAF50"
              d="M24 45.5c5.613 0 10.553-2.306 14.802-6.341l-5.839-5.841C30.842 35.846 27.059 38 24 38c-5.039 0-9.345-2.608-11.124-6.481l-6.571 4.819C9.642 41.277 16.318 45.5 24 45.5z"
            />
            <path
              fill="#1976D2"
              d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l5.839 5.841C44.196 35.123 45.5 29.837 45.5 24c0-1.538-.135-3.022-.389-4.417z"
            />
          </svg>
          {modo === "entrar" ? "Entrar com Google" : "Criar conta com Google"}
        </button>
      </form>

      {recado && <p className="entrar__recado" role="status">{recado}</p>}
      {erro && <p className="entrar__erro" role="alert">{erro}</p>}

      <p className="entrar__rodape">
        {modo === "entrar" ? (
          <>
            Ainda não tem conta?{" "}
            <button type="button" className="entrar__link" onClick={() => trocarModo("criar")}>
              Criar conta
            </button>
          </>
        ) : (
          <>
            Já tem conta?{" "}
            <button type="button" className="entrar__link" onClick={() => trocarModo("entrar")}>
              Entrar
            </button>
          </>
        )}
      </p>
    </div>
  );
}
