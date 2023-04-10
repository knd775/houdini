import { Link } from '$houdini'

export default function ({ Session, children }) {
	return (
		<div style={{ display: 'flex', flexDirection: 'row' }}>
			<ul>
				<li>
					<Link href="/">Home</Link>
				</li>
				<li>
					<Link href="/user/1">User 1</Link>
				</li>
				<li>
					<Link href="/user/2">User 2</Link>
				</li>
				<li>
					<Link href="/user/3">User 3</Link>
				</li>
			</ul>
			<div>{Session.viewer === null ? 'NO AUTH' : children}</div>
		</div>
	)
}
