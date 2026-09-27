import { useParams } from 'react-router-dom';
import NotionDetail from '../components/NotionDetail.jsx';

export default function NotionPage() {
  const { nid } = useParams();
  return <NotionDetail notionId={nid} />;
}
