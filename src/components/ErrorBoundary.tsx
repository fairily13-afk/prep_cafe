import { Component } from 'react';
import type { ReactNode } from 'react';
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <main style={{ maxWidth: 600, margin: '80px auto', padding: 24 }}><h1>화면을 표시하지 못했습니다.</h1><p role="alert">화면 오류가 발생했습니다. 저장 자료를 자동 삭제하거나 샘플로 교체하지 않습니다.</p><button onClick={() => location.reload()}>다시 열기</button></main> : this.props.children;
  }
}
