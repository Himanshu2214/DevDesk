import { Empty, Page } from '../components/ui';

/** Unknown route (an old bookmark or a typo in the address) */
export function Placeholder({ route }: { route: string }) {
  return (
    <Page crumb={<b>Not found</b>}>
      <Empty icon="search" title="This page does not exist" action={<a className="btn" href="#home">Back to Home</a>}>
        Nothing is at <code>#{route}</code>.</Empty>
    </Page>
  );
}
