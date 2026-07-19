import { ArrowRight, Github, Monitor, MoveUpRight } from "lucide-react";
import { Link } from "react-router";

const GITHUB_URL = "https://github.com/iola1999/uurc-web";
const V2EX_URL = "https://www.v2ex.com/t/1225978";

function HeroSignalMap() {
  return (
    <div className="landing-signal-field" aria-hidden="true">
      <span className="landing-signal-frame" />
      <span className="landing-signal-route landing-signal-route-a" />
      <span className="landing-signal-route landing-signal-route-b" />
      <span className="landing-signal-route landing-signal-route-c" />
      <span className="landing-signal-route landing-signal-route-d" />
      <span className="landing-signal-route landing-signal-route-e" />
      <span className="landing-signal-node landing-signal-node-a" />
      <span className="landing-signal-node landing-signal-node-b" />
      <span className="landing-signal-node landing-signal-node-c" />
      <span className="landing-signal-node landing-signal-node-active" />
    </div>
  );
}

export function LandingPage({ loggedIn }: { loggedIn: boolean }) {
  const consolePath = loggedIn ? "/devices" : "/login";

  return (
    <main className="landing-page">
      <section className="landing-hero" aria-labelledby="landing-title">
        <HeroSignalMap />

        <header className="landing-header">
          <a className="landing-brand" href="/" aria-label="UU Remote Web 首页">
            <span className="landing-brand-mark" aria-hidden="true">
              <Monitor size={16} />
            </span>
            <span>UU Remote Web</span>
          </a>
          <nav className="landing-nav" aria-label="首页导航">
            <a href={GITHUB_URL} target="_blank" rel="noreferrer">
              <Github size={16} />
              <span>GitHub</span>
            </a>
            <Link className="landing-nav-action" to={consolePath}>
              进入控制台
            </Link>
          </nav>
        </header>

        <div className="landing-hero-content">
          <p className="landing-eyebrow">UU Remote Web · 非官方开源项目</p>
          <h1 id="landing-title">UU 远程桌面网页版</h1>
          <p className="landing-hero-tagline">打开浏览器，连接并控制你的 UU 远程设备。</p>
          <p className="landing-hero-description">
            无需安装主控客户端。这是可自托管的非官方 UU 远程桌面 Web 版主控端，支持短信登录、设备列表和网页远程控制。
          </p>
          <div className="landing-actions">
            <Link className="landing-primary-action" to={consolePath}>
              进入控制台
              <ArrowRight size={18} />
            </Link>
            <a className="landing-secondary-action" href={GITHUB_URL} target="_blank" rel="noreferrer">
              查看源码
              <MoveUpRight size={16} />
            </a>
          </div>
          <p className="landing-action-note">短信登录，也支持导入已有账号凭证。</p>
        </div>
      </section>

      <section className="landing-workflow" aria-labelledby="workflow-title">
        <div className="landing-section-heading">
          <p className="landing-section-index">使用流程</p>
          <h2 id="workflow-title">从登录到远控</h2>
          <p>登录后选择在线设备，连接完成即可在网页中查看画面和发送输入。</p>
        </div>

        <div className="landing-steps">
          <article className="landing-step">
            <div className="landing-step-copy">
              <span>01 / 登录</span>
              <h3>使用手机号验证码登录</h3>
              <p>也可以导入已有账号凭证，省去重复登录。</p>
            </div>
            <figure className="landing-media landing-media-login">
              <img
                src="/product/login.png"
                alt="UU Remote Web 手机号验证码登录页面"
                width="960"
                height="680"
                loading="lazy"
              />
            </figure>
          </article>

          <article className="landing-step">
            <div className="landing-step-copy">
              <span>02 / 设备</span>
              <h3>在线设备一眼可见</h3>
              <p>从列表选择自己的设备，也可以输入设备 ID 发起伙伴协助。</p>
            </div>
            <figure className="landing-media">
              <img
                src="/product/device-list.png"
                alt="UU Remote Web 设备列表页面"
                width="1440"
                height="821"
                loading="lazy"
              />
            </figure>
          </article>

          <article className="landing-step">
            <div className="landing-step-copy">
              <span>03 / 远控</span>
              <h3>连接后直接开始控制</h3>
              <p>画面、输入、声音和剪贴板集中在同一个会话界面。</p>
            </div>
            <figure className="landing-media landing-media-dark">
              <img
                src="/product/remote-session.png"
                alt="UU Remote Web 远程控制会话页面"
                width="1440"
                height="861"
                loading="lazy"
              />
            </figure>
          </article>
        </div>
      </section>

      <section className="landing-final" aria-labelledby="landing-final-title">
        <div>
          <p className="landing-section-index">UU Remote Web</p>
          <h2 id="landing-final-title">准备开始？</h2>
          <p>已登录会直接进入设备页；首次使用会先前往登录。</p>
        </div>
        <Link className="landing-primary-action" to={consolePath}>
          进入控制台
          <ArrowRight size={18} />
        </Link>
      </section>

      <footer className="landing-footer">
        <p>
          UU Remote Web 是非官方开源项目，与网易及 UU 远程没有关联。请确认你信任当前部署，仅用于交流学习和个人使用。
        </p>
        <div>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a href={V2EX_URL} target="_blank" rel="noreferrer">
            V2EX 原帖
          </a>
        </div>
      </footer>
    </main>
  );
}
