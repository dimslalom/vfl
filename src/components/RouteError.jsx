import { t } from '../lib/i18n';
import { Component } from 'react';
import { Link } from 'react-router-dom';
import AppFrame from './AppFrame';
import StatusStrip from './StatusStrip';
import styles from './RouteError.module.css';

// Shared shell for the two ways a route can fail to render something useful:
// an unknown path, and a component that threw. Both used to produce a blank
// page - there was no `*` route and no error boundary.
function Fallback({ crumb, title, body, detail }) {
  return (
    <AppFrame>
      <StatusStrip crumb={crumb} />
      <div className={styles.content}>
        <p className={styles.code}>{crumb}</p>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.body}>{body}</p>
        {detail && <pre className={styles.detail}>{detail}</pre>}
        <Link className={styles.action} to="/">Back to modes</Link>
      </div>
    </AppFrame>
  );
}

export function NotFound() {
  return (
    <Fallback
      crumb="404"
      title={t('No such page')}
      body={t("That address doesn't match any screen in the app.")}
    />
  );
}

export default class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Fallback
        crumb={t('Error')}
        title={t('Something broke on this screen')}
        body={t('The rest of the app is still fine. Head back and try again.')}
        // Shown because this is a game people self-host and debug; it is the
        // message only, never a stack.
        detail={this.state.error?.message}
      />
    );
  }
}
