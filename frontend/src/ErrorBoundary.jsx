import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Error no capturado en la interfaz:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: "2rem", maxWidth: 480, margin: "3rem auto", textAlign: "center" }} role="alert">
          <h1 style={{ fontSize: "1.25rem" }}>Algo salió mal</h1>
          <p>
            Ocurrió un error inesperado en la interfaz. Podés intentar recargar la página; si el problema
            persiste, avisá al equipo técnico.
          </p>
          <button onClick={() => window.location.reload()}>Recargar página</button>
        </div>
      );
    }
    return this.props.children;
  }
}
