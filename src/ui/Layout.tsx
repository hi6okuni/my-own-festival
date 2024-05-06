import type { FC } from "hono/jsx";

export const Layout: FC = (props) => {
	return (
		<html lang="en">
			<body>{props.children}</body>
		</html>
	);
};
