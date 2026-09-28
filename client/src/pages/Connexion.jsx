import { useState } from 'react';
import { post } from '../api.js';
import { useAuth } from '../App.jsx';
import { Field } from '../components/ui.jsx';
import { formData } from '../util.js';

export default function Connexion() {
  const { status, refresh } = useAuth();
  const [mode, setMode] = useState(status.inscriptionOuverte ? 'inscription' : 'connexion');
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const d = formData(e);
    setErreur(null);
    setEnvoi(true);
    try {
      if (mode === 'inscription') {
        if (d.password !== d.password2) throw new Error('Les deux mots de passe ne correspondent pas');
        await post('/auth/register', d);
      } else {
        await post('/auth/login', d);
      }
      await refresh();
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="page-connexion">
      <form className="carte carte-connexion" onSubmit={submit}>
        <div className="logo-grand"><img src="/favicon.svg" alt="" /> Scolario</div>
        <p className="muted">Suivi de scolarité familial — du primaire au lycée.</p>
        {mode === 'inscription' && (
          <>
            <h2>Créer le foyer</h2>
            <Field label="Nom du foyer"><input name="foyer" placeholder="Famille Martin" required /></Field>
            <Field label="Votre prénom"><input name="nom" required autoComplete="given-name" /></Field>
          </>
        )}
        {mode === 'connexion' && <h2>Connexion</h2>}
        <Field label="Identifiant (e-mail)"><input name="email" type="email" required autoComplete="username" /></Field>
        <Field label="Mot de passe" aide={mode === 'inscription' ? '8 caractères minimum' : null}>
          <input name="password" type="password" required minLength={mode === 'inscription' ? 8 : undefined} autoComplete={mode === 'inscription' ? 'new-password' : 'current-password'} />
        </Field>
        {mode === 'inscription' && status.codeInvitationRequis && <Field label="Code d’invitation" aide="Fourni par la personne qui a installé l’application"><input name="code" required autoComplete="off" /></Field>}
        {mode === 'inscription' && <Field label="Confirmer le mot de passe"><input name="password2" type="password" required minLength={8} autoComplete="new-password" /></Field>}
        {erreur && <div className="alert alert-erreur">{erreur}</div>}
        <button className="btn btn-primaire btn-bloc" disabled={envoi}>{mode === 'inscription' ? 'Créer le foyer' : 'Se connecter'}</button>
        {status.inscriptionOuverte && (
          <button type="button" className="btn btn-lien" onClick={() => setMode(mode === 'inscription' ? 'connexion' : 'inscription')}>
            {mode === 'inscription' ? 'J’ai déjà un compte' : 'Créer un nouveau foyer'}
          </button>
        )}
        {!status.inscriptionOuverte && <p className="small muted">Pour obtenir un compte, demandez à un adulte du foyer de vous l’ajouter dans Paramètres › Adultes.</p>}
      </form>
    </div>
  );
}
